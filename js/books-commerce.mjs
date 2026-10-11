import { normalizeProduct, validAmazonUrl } from './books-room-catalog.mjs';

const cards = [...document.querySelectorAll('[data-books-product-id]')];
const status = document.querySelector('#associate-status');
const disableCard = card => {
  const link = card.querySelector('[data-commerce-link]');
  if (link) { link.hidden = true; link.removeAttribute('href'); }
  const pending = card.querySelector('[data-commerce-pending]');
  if (pending) { pending.hidden = true; pending.textContent = '商品リンクは準備中'; }
};
cards.forEach(disableCard);

let productsById;
try {
  const response = await fetch('/assets/books/room-products.json', { credentials: 'same-origin', signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error('product manifest unavailable');
  const records = await response.json();
  if (!Array.isArray(records)) throw new Error('product manifest is not an array');
  productsById = new Map();
  for (const record of records) {
    if (!record || typeof record !== 'object' || Array.isArray(record) || typeof record.id !== 'string' || !record.id.trim() || productsById.has(record.id)) throw new Error('invalid or duplicate product record');
    productsById.set(record.id, record);
  }
  for (const card of cards) {
    const record = productsById.get(card.dataset.booksProductId);
    const product = normalizeProduct(record);
    const matchesStatic = product && product.title === card.dataset.title
      && product.description === card.dataset.description
      && product.category === card.dataset.category
      && (record.format || '') === card.dataset.format
      && (record.author || '') === card.dataset.author
      && (record.publisher || '') === card.dataset.publisher
      && (record.sourceLabel || '') === card.dataset.sourceLabel
      && (record.sourceUrl || '') === card.dataset.sourceUrl
      && (record.workId || '') === card.dataset.workId
      && (record.metadataNote || '') === card.dataset.metadataNote
      && (record.image?.src || '') === card.dataset.imageSrc;
    if (!product || product.sample || !matchesStatic || product.asin !== card.dataset.asin) {
      card.hidden = true;
      card.dataset.catalogDisabled = 'true';
    }
  }
} catch {
  productsById = undefined;
  if (status) status.textContent = '商品カタログを確認できないため、商品リンクは準備中です。';
}
document.dispatchEvent(new Event('books:manifest-updated'));

if (!productsById) {
  document.dispatchEvent(new Event('books:commerce-ready'));
} else {
  try {
    const response = await fetch('/assets/books/room-commerce.json', { credentials: 'same-origin', signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error('commerce configuration unavailable');
    const config = await response.json();
    if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('invalid commerce configuration');
    const confirmed = config.enrollmentConfirmed === true
      && typeof config.associateName === 'string' && config.associateName.trim().length > 0;
    if (confirmed && status) status.textContent = 'Amazon のアソシエイトとして、PiXiEED は適格販売により収入を得ています。価格・販売条件は販売先のAmazonでご確認ください。';
    else if (status) status.textContent = 'Amazonアソシエイト登録は未確認のため、商品リンクは準備中です。';
    for (const card of cards) {
      if (card.dataset.catalogDisabled) continue;
      const product = normalizeProduct(productsById.get(card.dataset.booksProductId));
      const href = product && product.linkStatus === 'configured' ? validAmazonUrl(product.amazonUrl, product.asin) : '';
      if (!confirmed || !href) continue;
      const link = card.querySelector('[data-commerce-link]');
      const pending = card.querySelector('[data-commerce-pending]');
      link.href = href;
      link.hidden = false;
      if (pending) pending.hidden = true;
    }
  } catch {
    if (status) status.textContent = '登録情報を確認できないため、商品リンクは準備中です。';
  }
  document.dispatchEvent(new Event('books:commerce-ready'));
}
