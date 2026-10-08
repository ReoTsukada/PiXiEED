import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeProduct, validAmazonUrl } from '../../js/books-room-catalog.mjs';

const asin = 'B07H7DK5KH';
const plainUrl = `https://www.amazon.co.jp/dp/${asin}`;
const affiliateUrl = `${plainUrl}?tag=pixieed-22&linkCode=ll2`;

test('validates the exact Japanese Amazon product page and existing affiliate parameters', () => {
  assert.equal(validAmazonUrl(plainUrl, asin), plainUrl);
  assert.equal(validAmazonUrl(affiliateUrl, asin), affiliateUrl);
  assert.equal(validAmazonUrl(`${plainUrl}?tag=pixieed-22`, asin), `${plainUrl}?tag=pixieed-22`);
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
  const oldRecords = data.filter((item) => item.id !== 'product-pixel-tool-sample');
  assert.equal(oldRecords.length, 7);
  for (const record of oldRecords) {
    const normalized = normalizeProduct(record);
    assert.ok(normalized, record.id);
    assert.equal(normalized.linkStatus, 'configured', record.id);
    assert.equal(normalized.category, record.id === 'product-3d-dot' ? 'toys' : 'books');
  }
  const sample = data.find((item) => item.sample);
  assert.equal(sample.category, 'tools');
  assert.equal(normalizeProduct(sample).amazonUrl, '');

  const commerce = JSON.parse(await readFile(new URL('../../assets/books/room-commerce.json', import.meta.url), 'utf8'));
  assert.deepEqual(commerce, { associateName: '', enrollmentConfirmed: false });
});
