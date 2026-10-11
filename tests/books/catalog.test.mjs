import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { normalizeProduct, validAmazonUrl } from '../../js/books-room-catalog.mjs';

const asin = 'B07H7DK5KH';
const plainUrl = `https://www.amazon.co.jp/dp/${asin}`;
const affiliateUrl = `${plainUrl}?tag=pixieed-22&linkCode=ll2`;

test('validates the exact Japanese Amazon product page and existing affiliate parameters', () => {
  assert.equal(validAmazonUrl(plainUrl, asin), plainUrl);
  assert.equal(validAmazonUrl(affiliateUrl, asin), affiliateUrl);
  assert.equal(validAmazonUrl(`${plainUrl}?tag=pixieed-22`, asin), `${plainUrl}?tag=pixieed-22`);
  const supplied = `https://www.amazon.co.jp/DOT-Pixel-Art-Final-Fantasy-ebook/dp/B09GS15X9P?tag=pixieed-22&linkCode=ll2&linkId=94fc8e1ba9c83a0aa734a829601d8f20&ref_=as_li_ss_tl`;
  assert.equal(validAmazonUrl(supplied, 'B09GS15X9P'), supplied);
  for (const key of ['th', 'psc']) {
    const variant = `${plainUrl}?${key}=1&tag=pixieed-22&linkCode=ll2`;
    assert.equal(validAmazonUrl(variant, asin), variant);
    assert.equal(validAmazonUrl(`${plainUrl}?${key}=2&tag=pixieed-22`, asin), '');
    assert.equal(validAmazonUrl(`${plainUrl}?${key}=1&${key}=1&tag=pixieed-22`, asin), '');
  }
});

test('rejects unsafe hosts, URL credentials, ports, schemes, and ambiguous input', () => {
  for (const url of [
    `http://www.amazon.co.jp/dp/${asin}`,
    `https://amazon.co.jp/dp/${asin}`,
    `https://shop.amazon.co.jp/dp/${asin}`,
    `https://www.amazon.co.jp.evil.test/dp/${asin}`,
    `https://user:pass@www.amazon.co.jp/dp/${asin}`,
    `https://www.amazon.co.jp:443/dp/${asin}`,
    `javascript:alert(1)`,
    ` https://www.amazon.co.jp/dp/${asin}`,
    `https://www.amazon.co.jp/dp/${asin}\\@evil.test`,
    `${plainUrl}#fragment`,
  ]) assert.equal(validAmazonUrl(url, asin), '', url);
});

test('rejects mismatched ASINs and unapproved or repeated query parameters', () => {
  assert.equal(validAmazonUrl(`https://www.amazon.co.jp/dp/B0BZGSNDDY`, asin), '');
  assert.equal(validAmazonUrl(`${plainUrl}?tag=other-22`, asin), '');
  assert.equal(validAmazonUrl(`${plainUrl}?tag=pixieed-22&linkCode=other`, asin), '');
  assert.equal(validAmazonUrl(`${plainUrl}?tag=pixieed-22&tag=pixieed-22`, asin), '');
  assert.equal(validAmazonUrl(`${plainUrl}?tag=pixieed-22&campaign=anything`, asin), '');
  assert.equal(validAmazonUrl(`${plainUrl}?tag=pixieed-22&linkId=not-a-link-id`, asin), '');
  assert.equal(validAmazonUrl(`${plainUrl}?tag=pixieed-22&ref_=unapproved`, asin), '');
  assert.equal(validAmazonUrl(`${plainUrl}?tag=pixieed-22&linkId=94fc8e1ba9c83a0aa734a829601d8f20&linkId=94fc8e1ba9c83a0aa734a829601d8f20`, asin), '');
  assert.equal(validAmazonUrl(`https://www.amazon.co.jp/one/two/dp/${asin}`, asin), '');
});

test('normalizes a configured product without coercing untrusted fields', () => {
  const product = normalizeProduct({
    id: 'product-example', asin, title: '<img src=x>作品集', description: '<b>説明</b>',
    format: '紙の本', amazonUrl: affiliateUrl, category: 'books',
  });
  assert.deepEqual(product, {
    id: 'product-example', kind: 'product', asin, title: '<img src=x>作品集',
    description: '<b>説明</b>', format: '紙の本', category: 'books', amazonUrl: affiliateUrl,
    sample: false, linkStatus: 'configured',
  });
  assert.equal(normalizeProduct({ id: 'x', title: {}, description: [] }), false);
  assert.equal(normalizeProduct({ id: 'x', title: 'x', description: { html: 'bad' } }).description, '');
});

test('keeps samples and pending listings out of configured commerce state', () => {
  const sample = normalizeProduct({ id: 'sample', title: '道具例', category: 'tools', sample: true });
  assert.equal(sample.asin, '');
  assert.equal(sample.amazonUrl, '');
  assert.equal(sample.sample, true);
  assert.equal(sample.linkStatus, 'sample');
  assert.equal(sample.category, 'tools');

  const pending = normalizeProduct({ id: 'pending', title: '未登録商品' });
  assert.equal(pending.linkStatus, 'unconfigured');
  assert.equal(pending.amazonUrl, '');

  const malformed = normalizeProduct({ id: 'bad', title: '商品', asin: 'not-an-asin' });
  assert.equal(malformed.linkStatus, 'invalid');
  assert.equal(malformed.amazonUrl, '');
  assert.equal(normalizeProduct({ id: 'fallback', title: '商品', category: 'unknown' }).category, 'books');
});

test('retains all existing catalog records and adds one tools sample with no commerce URL', async () => {
  const data = JSON.parse(await readFile(new URL('../../assets/books/room-products.json', import.meta.url), 'utf8'));
  const oldIds = new Set(['product-dot-classroom', 'product-pochipochi', 'product-background', 'product-new-pixel-art', 'product-famicom', 'product-3d-dot', 'product-dot-notebook']);
  const oldRecords = data.filter((item) => oldIds.has(item.id));
  assert.equal(oldRecords.length, 7);
  for (const record of oldRecords) {
    const normalized = normalizeProduct(record);
    assert.ok(normalized, record.id);
    assert.equal(normalized.linkStatus, 'configured', record.id);
    assert.equal(normalized.category, record.id === 'product-3d-dot' ? 'toys' : record.id === 'product-dot-notebook' ? 'tools' : 'books');
  }
  const sample = data.find((item) => item.sample);
  assert.equal(sample.category, 'tools');
  assert.equal(normalizeProduct(sample), false);
  assert.equal(normalizeProduct({ ...sample, enabled: true }).amazonUrl, '');

  const commerce = JSON.parse(await readFile(new URL('../../assets/books/room-commerce.json', import.meta.url), 'utf8'));
  assert.deepEqual(commerce, { associateName: 'PiXiEED', enrollmentConfirmed: true });
});

test('catalog records carry only known credits and keep product art unclaimed', async () => {
  const data = JSON.parse(await readFile(new URL('../../assets/books/room-products.json', import.meta.url), 'utf8'));
  const products = data.filter(item => item.sample !== true && item.enabled !== false);
  assert.equal(products.length, 25);
  assert.ok(products.every(item => item.image === null));
  for (const product of products.filter(item => item.sourceUrl)) {
    assert.match(product.sourceUrl, /^https:\/\//);
    assert.ok(product.sourceLabel);
  }
  assert.equal(products.find(item => item.id === 'product-dot-notebook').sourceUrl, undefined);
  assert.equal(products.find(item => item.id === 'product-famicom').publisher, undefined);
});

test('publisher evidence improves the sticker puzzle while preserving uncertain models and variants', async () => {
  const data = JSON.parse(await readFile(new URL('../../assets/books/room-products.json', import.meta.url), 'utf8'));
  const sticker = data.find(item => item.asin === '4591191109');
  assert.equal(sticker.publisher, 'ポプラ社');
  assert.equal(sticker.sourceUrl, 'https://www.poplar.co.jp/book/search/result/archive/8008573.html');
  assert.match(sticker.metadataNote, /ISBN 978-4-591-19110-1/);
  assert.match(sticker.metadataNote, /Amazon.*公式未確認/);
  assert.match(data.find(item => item.asin === 'B09MTLJKMY').metadataNote, /Pixoo 64Ⅱ.*公式未確認/);
  assert.match(data.find(item => item.asin === 'B0CD1PYFHH').title, /AIイラスト集/);
  assert.match(data.find(item => item.asin === 'B0B49R5XQM').description, /LEGO純正品ではなく/);
});

test('catalog generator is deterministic and emits all twenty-five static cards on both routes', async () => {
  const files = [
    new URL('../../books/index.html', import.meta.url),
    new URL('../../books/room-preview.html', import.meta.url),
  ];
  const before = await Promise.all(files.map(file => readFile(file, 'utf8')));
  execFileSync(process.execPath, ['scripts/generate-books-catalog.mjs'], { cwd: fileURLToPath(new URL('../..', import.meta.url)) });
  const after = await Promise.all(files.map(file => readFile(file, 'utf8')));
  assert.deepEqual(after, before);
  for (const html of after) {
    assert.equal((html.match(/<article class="product-card"/g) || []).length, 25);
    assert.equal((html.match(/data-books-product-id=/g) || []).length, 25);
    assert.ok(html.includes('B0GQYVXZJD'));
    assert.ok(!html.includes('商品名未確認'));
    assert.match(html, /商品画像未掲載/);
    assert.match(html, /catalog-filters[^>]* hidden/);
    assert.match(html, /class="catalog-category-filter"/);
    assert.match(html, /class="catalog-more-filters" id="catalog-more-filters"/);
    assert.match(html, /class="catalog-filter-status" hidden/);
    assert.match(html, /aria-label="おもちゃ 6件"/);
    assert.match(html, /data-category-count/);
    assert.match(html, /class="catalog-image-note">商品画像は使用許諾未確認のため未掲載/);
    assert.match(html, /canonical" href="https:\/\/pixieed\.jp\/books\//);
    assert.doesNotMatch(html, /product-card__ad-label|product-card__sales|>広告</);
    assert.match(html, /Amazonで価格を確認/);
    assert.match(html, /Amazon のアソシエイトとして、PiXiEED は適格販売により収入を得ています/);
    assert.match(html, /og:image:type" content="image\/png"/);
    assert.match(html, /twitter:image:alt/);
  }
  assert.doesNotMatch(after[0], /name="robots"[^>]*noindex/);
  assert.match(after[1], /noindex,follow/);
  const commerce = JSON.parse(await readFile(new URL('../../assets/books/room-commerce.json', import.meta.url), 'utf8'));
  assert.equal(commerce.enrollmentConfirmed, true);
  assert.equal(commerce.associateName, 'PiXiEED');
});

test('six supplied listings retain exact ASINs, affiliate parameters and format distinctions without private chat metadata', async () => {
  const data = JSON.parse(await readFile(new URL('../../assets/books/room-products.json', import.meta.url), 'utf8'));
  const expected = new Map([
    ['B09GS15X9P', '94fc8e1ba9c83a0aa734a829601d8f20'],
    ['B0B6Z7Y4GV', '3064a5e5eb5387db83bd610acef3667e'],
    ['B0G7T5VKRP', 'bec2b2379eeb6feb25bb6544486744ee'],
    ['B0CYPD1P9V', '673ccdfb71690f8d4111b92dd50eaa34'],
    ['B0BQ6GD3PY', 'fb02d3d72e664258454fadf5bd566300'],
    ['B0CD1PYFHH', '2d01d873dcb1735c419ad5bfa3859dd3'],
  ]);
  const added = data.filter(item => expected.has(item.asin));
  assert.equal(added.length, 6);
  const active = data.filter(item => !item.sample && item.enabled !== false);
  assert.equal(new Set(active.map(item => item.asin)).size, 25);
  assert.equal(new Set(active.map(item => item.id)).size, 25);
  for (const product of added) {
    const url = new URL(product.amazonUrl);
    assert.equal(url.searchParams.get('tag'), 'pixieed-22');
    assert.equal(url.searchParams.get('linkCode'), 'll2');
    assert.equal(url.searchParams.get('linkId'), expected.get(product.asin));
    assert.equal(url.searchParams.get('ref_'), 'as_li_ss_tl');
    assert.equal(url.searchParams.size, 4);
    assert.equal(normalizeProduct(product).amazonUrl, product.amazonUrl);
    assert.equal(product.format, 'Kindle版');
    assert.match(product.metadataNote, /公式未確認/);
    assert.equal('registrationSource' in product, false);
    assert.equal(product.image, null);
    for (const key of ['price', 'rating', 'reviewCount', 'stock']) assert.equal(key in product, false);
  }
  const paper = data.find(item => item.asin === '4862465021'), kindle = data.find(item => item.asin === 'B0B6Z7Y4GV');
  assert.equal(paper.workId, kindle.workId);
  assert.equal(paper.title, kindle.title);
  assert.equal(paper.format, '紙の本');
  assert.match(paper.metadataNote, /紙版/);
  assert.match(kindle.metadataNote, /Kindle版/);
  assert.match(data.find(item => item.asin === 'B09GS15X9P').metadataNote, /URL由来の暫定/);
  assert.match(data.find(item => item.asin === 'B0CD1PYFHH').title, /AIイラスト集/);
  for (const route of ['index.html', 'room-preview.html']) {
    const html = await readFile(new URL(`../../books/${route}`, import.meta.url), 'utf8');
    for (const product of active) {
      const article = html.split(`<article class="product-card" id="${product.id}"`)[1]?.split('</article>')[0];
      assert.ok(article, product.id);
      assert.ok(article.includes(`data-asin="${product.asin}"`));
      assert.ok(article.includes(`data-format="${product.format}"`));
      if (product.metadataNote) assert.ok(article.includes(product.metadataNote));
    }
  }
});

test('nine supplied links merge duplicate ASINs, retain variants and verify the formerly unidentified item', async () => {
  const data = JSON.parse(await readFile(new URL('../../assets/books/room-products.json', import.meta.url), 'utf8'));
  const expected = new Map([
    ['B0FJW7GQ8X', ['49f0e00e7af04dabde694204a3e1d1c3', null]],
    ['B0GHSKJYM7', ['4701eb3acc16e1a7e3de231b5ef67175', 'th']],
    ['B0HJYV517H', ['56d289f945138caf6f934f7ceba87c74', null]],
    ['4839914664', ['0d088f012baec73d06bd0db03c945d99', null]],
    ['4591191109', ['359501cd766390fc6baa6d71a203e48f', null]],
    ['B09PB3DKVL', ['fd6f830dab3467236d8cce9058493a35', null]],
    ['B09MTLJKMY', ['8cde5d9ff69ff4528e18fd9e2bf8e880', 'psc']],
    ['B08LQ4SBXD', ['7989234052f8b01f38b071c67c3c2936', 'th']],
    ['B0GQYVXZJD', ['80786c14fa0abb719ccfab5ee059e9de', 'psc']],
  ]);
  const added = data.filter(item => expected.has(item.asin) && !item.previousAmazonUrls?.length);
  const updated = data.filter(item => expected.has(item.asin) && Boolean(item.previousAmazonUrls?.length));
  assert.equal(added.length, 7);
  assert.equal(updated.length, 2);
  assert.equal(added.filter(item => item.enabled !== false).length, 7);
  const real = data.filter(item => !item.sample);
  assert.equal(real.length, 25);
  assert.equal(new Set(real.map(item => item.asin)).size, real.length);
  assert.equal(new Set(data.map(item => item.id)).size, data.length);
  for (const [asin, [linkId, variant]] of expected) {
    const matches = data.filter(item => item.asin === asin);
    assert.equal(matches.length, 1, asin);
    const product = matches[0], url = new URL(product.amazonUrl);
    assert.equal(validAmazonUrl(product.amazonUrl, asin), product.amazonUrl);
    assert.equal(url.pathname, `/dp/${asin}`);
    assert.equal(url.searchParams.get('tag'), 'pixieed-22');
    assert.equal(url.searchParams.get('linkCode'), 'll2');
    assert.equal(url.searchParams.get('linkId'), linkId);
    assert.equal(url.searchParams.get('ref_'), 'as_li_ss_tl');
    assert.equal(url.searchParams.size, variant ? 5 : 4);
    if (variant) assert.equal(url.searchParams.get(variant), '1');
  }
  const identified = data.find(item => item.asin === 'B0GQYVXZJD');
  assert.notEqual(identified.enabled, false);
  assert.equal(identified.title, 'Divoom Timebox Evo ピクセルアートスピーカー ブラック');
  assert.equal(identified.identification.method, 'normal-browser-visible-product-title');
  assert.equal(identified.identification.status, 'name-confirmed');
  assert.equal(identified.identification.observedAsin, identified.asin);
  assert.equal(normalizeProduct(identified).category, 'gadgets');
  assert.ok(!data.some(item => item.status === 'pending-identification'));
  assert.match(data.find(item => item.id === 'product-dot-notebook').title, /16×16／24×24／32×32｜A4・全80ページ/);
  assert.match(data.find(item => item.id === 'product-dot-notebook').metadataNote, /公式仕様は未確認/);
  for (const item of updated) assert.deepEqual(item.previousAmazonUrls, [`https://www.amazon.co.jp/dp/${item.asin}?tag=pixieed-22&linkCode=ll2`]);
  for (const item of data.filter(item => item.category === 'gadgets')) {
    assert.equal(normalizeProduct(item).category, 'gadgets');
    assert.equal(item.image, null);
  }
});

test('four block links retain exact affiliate URLs, separate brands and record observed product identities', async () => {
  const data = JSON.parse(await readFile(new URL('../../assets/books/room-products.json', import.meta.url), 'utf8'));
  const expected = new Map([
    ['B08D2Z2N87', 'linkCode=ll2&tag=pixieed-22&linkId=3e761aad98de941bb99aa0a4d699ffa3&ref_=as_li_ss_tl'],
    ['B09BNVC2GB', 'th=1&linkCode=ll2&tag=pixieed-22&linkId=6aafe91861dc4a9559ffeb3ae5b4c30f&ref_=as_li_ss_tl'],
    ['B0B49R5XQM', 'th=1&linkCode=ll2&tag=pixieed-22&linkId=05900a3159b78b6fad0cbae8a6ec40c6&ref_=as_li_ss_tl'],
    ['B0CFQH8QR5', 'th=1&linkCode=ll2&tag=pixieed-22&linkId=7d0148627c4ee134c6459d53f3615ce0&ref_=as_li_ss_tl'],
  ]);
  const added = data.filter(item => expected.has(item.asin));
  assert.equal(added.length, 4);
  for (const item of added) {
    assert.equal(item.amazonUrl, `https://www.amazon.co.jp/dp/${item.asin}?${expected.get(item.asin)}`);
    assert.equal(validAmazonUrl(item.amazonUrl, item.asin), item.amazonUrl);
    assert.notEqual(normalizeProduct(item), false);
    assert.equal(item.image, null);
    for (const key of ['price', 'rating', 'reviewCount', 'stock']) assert.equal(key in item, false);
  }
  for (const asin of ['B08D2Z2N87', 'B0CFQH8QR5']) {
    const item = added.find(item => item.asin === asin);
    assert.equal(item.identification.observedAsin, asin);
    assert.equal(item.identification.status, 'name-confirmed');
    assert.equal(item.identification.method, 'normal-browser-visible-product-title');
  }
  assert.equal(added.find(item => item.asin === 'B08D2Z2N87').category, 'gadgets');
  assert.match(added.find(item => item.asin === 'B09BNVC2GB').title, /^LEGO /);
  const otherBrand = added.find(item => item.asin === 'B0B49R5XQM');
  assert.match(otherBrand.title, /^WYSWYG /);
  assert.ok(!otherBrand.title.includes('LEGO'));
  assert.equal(added.find(item => item.asin === 'B0CFQH8QR5').title, 'ブロック基礎板 4色8枚セット');
  assert.equal(added.filter(item => item.category === 'toys').length, 3);
});

test('cat block listing preserves its affiliate URL without asserting a conflicting breed or selected variant', async () => {
  const data = JSON.parse(await readFile(new URL('../../assets/books/room-products.json', import.meta.url), 'utf8'));
  const matches = data.filter(item => item.asin === 'B0HDNWKD9Y');
  assert.equal(matches.length, 1);
  const item = matches[0];
  assert.equal(item.title, '猫のブロックセット');
  assert.equal(item.category, 'toys');
  assert.equal(item.amazonUrl, 'https://www.amazon.co.jp/dp/B0HDNWKD9Y?th=1&linkCode=ll2&tag=pixieed-22&linkId=af54ae4f4ff7bb562a902bc77fd445ab&ref_=as_li_ss_tl');
  assert.equal(validAmazonUrl(item.amazonUrl, item.asin), item.amazonUrl);
  assert.equal('registrationSource' in item, false);
  assert.equal(item.identification.observedAsin, item.asin);
  assert.equal(item.identification.variantStatus, 'unconfirmed-conflicting-cat-breeds');
  assert.match(item.metadataNote, /選択種類・猫種・ブランド・互換性・対象年齢・知育効果は未確認/);
  assert.equal(item.image, null);
  for (const key of ['brand', 'breed', 'age', 'price', 'rating', 'reviewCount', 'stock']) assert.equal(key in item, false);
});

test('hidden records are excluded before catalog or shelf selection', () => {
  assert.equal(normalizeProduct({ id: 'hidden', title: 'hidden', enabled: false }), false);
  assert.equal(normalizeProduct({ id: 'hidden', title: 'hidden', visible: false }), false);
});

test('public product records contain no private conversation metadata', async () => {
  const data = JSON.parse(await readFile(new URL('../../assets/books/room-products.json', import.meta.url), 'utf8'));
  for (const item of data) {
    for (const key of ['registrationSource', 'latestRegistrationSource', 'messageId', 'providedAt']) assert.equal(key in item, false, item.id);
  }
});
