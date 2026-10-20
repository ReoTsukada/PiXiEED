import { normalizeProduct, normalizeYahooRelatedOffers, validAmazonUrl } from './books-room-catalog.mjs?rev=20261020-yahoo-related-offers-1';

const cards = [...document.querySelectorAll('[data-books-product-id]')];
const status = document.querySelector('#associate-status');
const disableCard = card => {
  card.querySelectorAll('[data-commerce-link], [data-yahoo-commerce-link]').forEach(link => { link.hidden = true; link.removeAttribute('href'); });
  const pending = card.querySelector('[data-commerce-pending]');
  if (pending) { pending.hidden = true; pending.textContent = '商品リンクは準備中'; }
};
cards.forEach(disableCard);

let productsById;
const relatedOffersByProductId = new Map();
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
    const relatedOffers = normalizeYahooRelatedOffers(record?.relatedOffers, record?.id);
    const staticOffers = [...card.querySelectorAll('[data-yahoo-commerce-link]')];
    const staticSection = card.querySelector('[data-related-offers]');
    const staticNotes = [...(staticSection?.querySelectorAll('[data-offer-visible-note]') || [])];
    const sectionHeading = staticSection?.querySelector('h4');
    const offersMatchStatic = Array.isArray(relatedOffers) && staticOffers.length === relatedOffers.length
      && staticNotes.length === relatedOffers.length
      && (relatedOffers.length === 0 ? !staticSection : Boolean(staticSection
        && staticSection.dataset.sectionLabel === relatedOffers[0].sectionLabel
        && sectionHeading?.textContent === relatedOffers[0].sectionLabel))
      && relatedOffers.every(offer => {
        const link = staticOffers.find(item => item.dataset.offerId === offer.offerId);
        const visibleLabel = link?.querySelector('[data-offer-visible-label]');
        const visibleNote = staticNotes.find(item => item.dataset.offerNoteId === offer.offerId);
        return link && link.dataset.offerProductId === offer.productId
          && link.dataset.offerHref === offer.href && link.dataset.offerTitle === offer.title
          && link.dataset.offerMerchant === offer.merchant && link.dataset.offerLabel === offer.label
          && link.dataset.offerNote === offer.note && link.dataset.offerSourceUrl === offer.sourceUrl
          && link.dataset.offerCheckedDate === offer.checkedDate
          && visibleLabel?.textContent === offer.label
          && visibleNote?.textContent === offer.note && visibleNote.hidden;
      });
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
      && (record.image?.src || record.shopThumbnail?.src || '') === card.dataset.imageSrc;
    if (!product || product.sample || !matchesStatic || product.asin !== card.dataset.asin) {
      card.hidden = true;
      card.dataset.catalogDisabled = 'true';
    } else if (offersMatchStatic && relatedOffers.length) {
      relatedOffersByProductId.set(record.id, relatedOffers);
      card.dataset.relatedSearch = relatedOffers.map(offer => `${offer.title} ${offer.merchant} ${offer.label} ${offer.note}`).join(' ');
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
    const amazonConfirmed = config.enrollmentConfirmed === true
      && typeof config.associateName === 'string' && config.associateName.trim().length > 0;
    const yahooConfirmed = config.yahooAffiliateLinksConfirmed === true;
    const yahooDisclosure = 'Yahoo!ショッピングのアフィリエイトリンクを含みます。PiXiEEDは適格販売により収入を得る場合があります。価格・販売条件・版・仕様は販売先でご確認ください。';
    if (status) {
      const disclosures = [amazonConfirmed
        ? 'Amazon のアソシエイトとして、PiXiEED は適格販売により収入を得ています。価格・販売条件は販売先のAmazonでご確認ください。'
        : 'Amazonアソシエイト登録は未確認のため、Amazon商品リンクは準備中です。'];
      if (yahooConfirmed) disclosures.push(yahooDisclosure);
      else if (relatedOffersByProductId.size) disclosures.push('Yahoo!ショッピングの購入リンク設定が確認できないため、Yahoo!商品リンクは準備中です。');
      status.textContent = disclosures.join(' ');
    }
    for (const card of cards) {
      if (card.dataset.catalogDisabled) continue;
      const record = productsById.get(card.dataset.booksProductId);
      const product = normalizeProduct(record);
      const href = product && product.linkStatus === 'configured' ? validAmazonUrl(product.amazonUrl, product.asin) : '';
      if (amazonConfirmed && href) {
        const link = card.querySelector('[data-commerce-link]');
        if (link) { link.href = href; link.hidden = false; }
        const pending = card.querySelector('[data-commerce-pending]');
        if (pending) pending.hidden = true;
      }
      if (yahooConfirmed) {
        const offers = relatedOffersByProductId.get(card.dataset.booksProductId) || [];
        for (const offer of offers) {
          const link = [...card.querySelectorAll('[data-yahoo-commerce-link]')].find(item => item.dataset.offerId === offer.offerId);
          if (!link || link.dataset.offerHref !== offer.href) continue;
          link.href = offer.href;
          link.target = '_blank';
          link.rel = 'sponsored noopener noreferrer';
          link.hidden = false;
          const note = card.querySelector(`[data-offer-note-id="${offer.offerId}"]`);
          if (note) note.hidden = false;
        }
      }
    }
  } catch {
    if (status) status.textContent = '登録情報を確認できないため、商品リンクは準備中です。';
  }
  document.dispatchEvent(new Event('books:commerce-ready'));
}
