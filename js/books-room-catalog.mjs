const ASIN_PATTERN = /^[A-Z0-9]{10}$/;
const CATEGORIES = new Set(['books', 'toys', 'tools']);
const AMAZON_HOST = 'www.amazon.co.jp';
const EXISTING_ASSOCIATE_TAG = 'pixieed-22';
const EXISTING_LINK_CODE = 'll2';

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
        || url.pathname !== `/dp/${asin}` || url.hash) return '';

    const entries = [...url.searchParams.entries()];
    if (entries.length) {
      const keys = entries.map(([key]) => key);
      if (new Set(keys).size !== keys.length) return '';
      const params = Object.fromEntries(entries);
      if (params.tag !== EXISTING_ASSOCIATE_TAG
          || Object.keys(params).some((key) => key !== 'tag' && key !== 'linkCode')
          || (params.linkCode !== undefined && params.linkCode !== EXISTING_LINK_CODE)) return '';
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
