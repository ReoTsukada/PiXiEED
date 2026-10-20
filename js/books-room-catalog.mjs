const ASIN_PATTERN = /^[A-Z0-9]{10}$/;
const CATEGORIES = new Set(['books', 'toys', 'tools', 'gadgets']);
const AMAZON_HOST = 'www.amazon.co.jp';
const EXISTING_ASSOCIATE_TAG = 'pixieed-22';
const EXISTING_LINK_CODE = 'll2';

const YAHOO_RELATED_OFFERS = Object.freeze({
  VcagnL: Object.freeze({
    productId: 'product-dot-classroom', href: 'https://yahoo.jp/VcagnL',
    title: 'ドット絵教室 電子書籍版', merchant: 'ebookjapan ヤフー店',
    label: '電子書籍版（ebookjapan ヤフー店）', note: 'AmazonのKindle版とは別に、電子書籍版を確認',
    sectionLabel: 'Yahoo!ショッピングの販売先',
    sourceUrl: 'https://store.shopping.yahoo.co.jp/ebookjapan/b00162030316.html', checkedDate: '2026-10-20',
  }),
  QGVY75: Object.freeze({
    productId: 'product-pochipochi', href: 'https://yahoo.jp/QGVY75',
    title: 'ぽちぽちドット絵 自由に描いて楽しもう！', merchant: 'bookfanプレミアム',
    label: 'bookfanプレミアムで確認', note: '版・仕様は販売先で確認',
    sectionLabel: 'Yahoo!ショッピングの販売先',
    sourceUrl: 'https://store.shopping.yahoo.co.jp/bookfan/bk-4295202517.html', checkedDate: '2026-10-20',
  }),
  UZdRQ2: Object.freeze({
    productId: 'product-3d-dot', href: 'https://yahoo.jp/UZdRQ2',
    title: '立体ドット絵メーカー RD-10', merchant: 'アイリスプラザ Yahoo!店',
    label: 'RD-10（アイリスプラザ Yahoo!店）', note: 'くもん出版 RD-10',
    sectionLabel: 'Yahoo!ショッピングの販売先',
    sourceUrl: 'https://store.shopping.yahoo.co.jp/irisplaza/7296660.html', checkedDate: '2026-10-20',
  }),
  '6bv5C3': Object.freeze({
    productId: 'product-dot-sticker-masterpieces', href: 'https://yahoo.jp/6bv5C3',
    title: 'ドット絵シールパズル 世界の名画', merchant: 'タワーレコード Yahoo!店',
    label: 'タワーレコード Yahoo!店で確認', note: '版・仕様・販売条件は販売先で確認',
    sectionLabel: 'Yahoo!ショッピングの販売先',
    sourceUrl: 'https://store.shopping.yahoo.co.jp/tower/8175200.html', checkedDate: '2026-10-20',
  }),
  WSpxf2: Object.freeze({
    productId: 'product-divoom-ditoo-pro-white', href: 'https://yahoo.jp/WSpxf2',
    title: 'Divoom DITOO Mic', merchant: 'ハートシステムグループ',
    label: 'ハートシステムグループ',
    note: '色は販売先で選択', sectionLabel: 'Yahoo!ショッピングの関連モデル（DITOO Mic・Ditoo-Proとは別モデル）',
    sourceUrl: 'https://store.shopping.yahoo.co.jp/heartsystem/divoom.html', checkedDate: '2026-10-20',
  }),
  '76DmXL': Object.freeze({
    productId: 'product-divoom-ditoo-pro-white', href: 'https://yahoo.jp/76DmXL',
    title: 'Divoom DITOO Mic ピンク', merchant: 'shopooo by GMO',
    label: 'shopooo by GMO（ピンク）',
    note: '販売先の商品名にピンク表記あり', sectionLabel: 'Yahoo!ショッピングの関連モデル（DITOO Mic・Ditoo-Proとは別モデル）',
    sourceUrl: 'https://store.shopping.yahoo.co.jp/itempost/1-tokotokoneko-387.html', checkedDate: '2026-10-20',
  }),
});

const YAHOO_OFFER_FIELDS = Object.freeze([
  'productId', 'href', 'title', 'merchant', 'label', 'note', 'sectionLabel', 'sourceUrl', 'checkedDate',
]);

/** Accept only the six reviewed Yahoo short links with their bound product and display metadata. */
export function normalizeYahooRelatedOffer(candidate, productId) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)
      || typeof candidate.offerId !== 'string') return false;
  const expected = YAHOO_RELATED_OFFERS[candidate.offerId];
  if (!expected || expected.productId !== productId) return false;
  const url = typeof candidate.href === 'string' ? candidate.href : '';
  if (url !== expected.href || url !== `https://yahoo.jp/${candidate.offerId}`) return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'yahoo.jp' || parsed.username || parsed.password
        || parsed.port || parsed.pathname !== `/${candidate.offerId}` || parsed.search || parsed.hash) return false;
  } catch { return false; }
  if (YAHOO_OFFER_FIELDS.some(field => candidate[field] !== expected[field])) return false;
  return { offerId: candidate.offerId, ...expected };
}

/** Validate all related offers atomically, rejecting duplicates and unlisted or malformed records. */
export function normalizeYahooRelatedOffers(candidates, productId) {
  if (candidates === undefined) return [];
  if (!Array.isArray(candidates) || candidates.length > 6) return false;
  const seen = new Set(); const offers = [];
  for (const candidate of candidates) {
    const offer = normalizeYahooRelatedOffer(candidate, productId);
    if (!offer || seen.has(offer.offerId)) return false;
    seen.add(offer.offerId); offers.push(offer);
  }
  return offers;
}

/**
 * Validate a product page URL for the Japanese Amazon store.
 * Plain /dp/ASIN URLs and the exact affiliate parameters already present in
 * the catalog are accepted. The function never adds or guesses tracking data.
 */
export function validAmazonUrl(rawUrl, asin) {
  if (typeof rawUrl !== 'string' || !rawUrl || rawUrl !== rawUrl.trim()
      || /[\\\s]/u.test(rawUrl) || rawUrl.includes('#')
      || typeof asin !== 'string' || !ASIN_PATTERN.test(asin)) return '';
  const authority = rawUrl.match(/^https:\/\/([^/?#]*)/i)?.[1];
  if (authority !== AMAZON_HOST) return '';

  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'https:' || url.hostname !== AMAZON_HOST
        || url.username || url.password || url.port
        || !new RegExp(`^/(?:[A-Za-z0-9-]+/)?dp/${asin}$`).test(url.pathname) || url.hash) return '';

    const entries = [...url.searchParams.entries()];
    if (entries.length) {
      const keys = entries.map(([key]) => key);
      if (new Set(keys).size !== keys.length) return '';
      const params = Object.fromEntries(entries);
      if (params.tag !== EXISTING_ASSOCIATE_TAG
          || Object.keys(params).some((key) => !['tag', 'linkCode', 'linkId', 'ref_', 'th', 'psc'].includes(key))
          || (params.linkCode !== undefined && params.linkCode !== EXISTING_LINK_CODE)
          || (params.linkId !== undefined && !/^[a-f0-9]{32}$/.test(params.linkId))
          || (params.ref_ !== undefined && params.ref_ !== 'as_li_ss_tl')
          || (params.th !== undefined && params.th !== '1')
          || (params.psc !== undefined && params.psc !== '1')) return '';
    }
    return url.href;
  } catch {
    return '';
  }
}

/** Normalize untrusted JSON data into a safe, display-ready product record. */
export function normalizeProduct(candidate) {
  if (!candidate || candidate.enabled === false || candidate.visible === false
      || typeof candidate !== 'object' || Array.isArray(candidate)
      || typeof candidate.id !== 'string' || !candidate.id.trim()
      || typeof candidate.title !== 'string' || !candidate.title.trim()) return false;

  const sample = candidate.sample === true;
  const rawAsin = candidate.asin;
  const asin = typeof rawAsin === 'string' ? rawAsin : '';
  const rawUrl = candidate.amazonUrl;
  const hasAsin = asin.length > 0;
  const hasUrl = typeof rawUrl === 'string' && rawUrl.length > 0;
  const amazonUrl = hasAsin && hasUrl ? validAmazonUrl(rawUrl, asin) : '';
  let linkStatus = 'unconfigured';
  if (sample) linkStatus = 'sample';
  else if ((hasAsin && !ASIN_PATTERN.test(asin)) || (hasUrl && !amazonUrl)
      || (hasAsin !== hasUrl)) linkStatus = 'invalid';
  else if (amazonUrl) linkStatus = 'configured';

  return {
    id: candidate.id,
    kind: 'product',
    asin: ASIN_PATTERN.test(asin) ? asin : '',
    title: candidate.title,
    description: typeof candidate.description === 'string' ? candidate.description : '',
    format: typeof candidate.format === 'string' ? candidate.format : '',
    category: CATEGORIES.has(candidate.category) ? candidate.category : 'books',
    amazonUrl,
    sample,
    linkStatus,
  };
}
