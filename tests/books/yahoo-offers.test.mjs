import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeYahooRelatedOffer, normalizeYahooRelatedOffers } from '../../js/books-room-catalog.mjs';

const root = new URL('../../', import.meta.url);

test('the six exact Yahoo short links are bound to five existing products', async () => {
  const products = JSON.parse(await readFile(new URL('assets/books/room-products.json', root), 'utf8'));
  const active = products.filter(item => item.sample !== true && item.enabled !== false);
  assert.equal(active.length, 25);
  const related = active.flatMap(product => normalizeYahooRelatedOffers(product.relatedOffers, product.id));
  assert.equal(related.length, 6);
  assert.equal(new Set(related.map(offer => offer.offerId)).size, 6);
  assert.equal(new Set(related.map(offer => offer.productId)).size, 5);
  assert.deepEqual(new Map(related.map(offer => [offer.offerId, offer.productId])), new Map([
    ['VcagnL', 'product-dot-classroom'],
    ['QGVY75', 'product-pochipochi'],
    ['UZdRQ2', 'product-3d-dot'],
    ['6bv5C3', 'product-dot-sticker-masterpieces'],
    ['WSpxf2', 'product-divoom-ditoo-pro-white'],
    ['76DmXL', 'product-divoom-ditoo-pro-white'],
  ]));
  const dittoMic = related.filter(offer => offer.productId === 'product-divoom-ditoo-pro-white');
  assert.equal(dittoMic.length, 2);
  assert.ok(dittoMic.every(offer => offer.sectionLabel.includes('Ditoo-Proとは別モデル')));
  assert.ok(dittoMic.every(offer => offer.sectionLabel.includes('Yahoo!ショッピング')));
  assert.equal(dittoMic.find(offer => offer.offerId === 'WSpxf2').label, 'ハートシステムグループ');
  assert.equal(dittoMic.find(offer => offer.offerId === '76DmXL').label, 'shopooo by GMO（ピンク）');
  assert.match(dittoMic.find(offer => offer.offerId === 'WSpxf2').note, /色は販売先で選択/);
  assert.match(dittoMic.find(offer => offer.offerId === '76DmXL').title, /ピンク/);
  assert.match(products.find(item => item.id === 'product-dot-classroom').format, /Kindle/);
  assert.match(products.find(item => item.id === 'product-dot-classroom').relatedOffers[0].title, /電子書籍版/);
  assert.match(products.find(item => item.id === 'product-pochipochi').relatedOffers[0].note, /版・仕様は販売先で確認/);
});

test('Yahoo offer validation rejects URL variants, wrong product bindings, bad labels and duplicates', async () => {
  const products = JSON.parse(await readFile(new URL('assets/books/room-products.json', root), 'utf8'));
  const record = products.find(item => item.id === 'product-dot-classroom');
  const offer = record.relatedOffers[0];
  assert.ok(normalizeYahooRelatedOffer(offer, record.id));
  assert.equal(normalizeYahooRelatedOffer(offer, 'product-pochipochi'), false);
  for (const href of [
    'http://yahoo.jp/VcagnL',
    'https://yahoo.jp.evil.test/VcagnL',
    'https://user@yahoo.jp/VcagnL',
    'https://yahoo.jp:443/VcagnL',
    'https://yahoo.jp/VcagnL?x=1',
    'https://yahoo.jp/VcagnL#detail',
    'https://yahoo.jp/%56cagnL',
    'https://yahoo.jp/VcagnL/',
    'https://yahoo.jp/unknown',
  ]) assert.equal(normalizeYahooRelatedOffer({ ...offer, href }, record.id), false, href);
  assert.equal(normalizeYahooRelatedOffer({ ...offer, label: '<img src=x>' }, record.id), false);
  assert.equal(normalizeYahooRelatedOffers([offer, offer], record.id), false);
  assert.equal(normalizeYahooRelatedOffers([{ ...offer, offerId: 'unlisted' }], record.id), false);
});

test('generated affiliate anchors stay inert in the shelf and keep the original catalog size', async () => {
  const [html, commerce, runtime] = await Promise.all([
    readFile(new URL('books/index.html', root), 'utf8'),
    readFile(new URL('assets/books/room-commerce.json', root), 'utf8'),
    readFile(new URL('js/books-commerce.mjs', root), 'utf8'),
  ]);
  assert.equal((html.match(/<article class="product-card"/g) || []).length, 25);
  assert.equal((html.match(/data-books-product-id=/g) || []).length, 25);
  assert.equal((html.match(/data-yahoo-commerce-link/g) || []).length, 6);
  assert.equal((html.match(/class="product-card__related-offers" data-related-offers data-section-label="[^"]+" hidden/g) || []).length, 5);
  assert.equal((html.match(/data-offer-href="https:\/\/yahoo\.jp\//g) || []).length, 6);
  assert.equal((html.match(/data-yahoo-commerce-link[^>]*hidden href="#"/g) || []).length, 6);
  assert.equal((html.match(/data-offer-visible-note data-offer-note-id="[^"]+" hidden/g) || []).length, 6);
  assert.match(html, /data-section-label="Yahoo!ショッピングの関連モデル（DITOO Mic・Ditoo-Proとは別モデル）"/);
  assert.match(html, /<p class="product-card__yahoo-note"[^>]*>版・仕様は販売先で確認<\/p>/);
  assert.match(html, /<p class="product-card__yahoo-note"[^>]*>色は販売先で選択<\/p>/);
  assert.match(html, /<span data-offer-visible-label>shopooo by GMO（ピンク）<\/span>/);
  assert.doesNotMatch(html, /\shref="https:\/\/yahoo\.jp\//);
  assert.match(html, /Yahoo!ショッピングのアフィリエイトリンクを含みます/);
  assert.match(html, /class="catalog-disclosure"><span>広告・PR<\/span> Amazon・Yahoo!の購入リンクを含みます<\/p>/);
  assert.match(commerce, /"enrollmentConfirmed": true/);
  assert.match(commerce, /"yahooAffiliateLinksConfirmed": true/);
  assert.match(runtime, /const amazonConfirmed = config\.enrollmentConfirmed === true/);
  assert.match(runtime, /const yahooConfirmed = config\.yahooAffiliateLinksConfirmed === true/);
});
