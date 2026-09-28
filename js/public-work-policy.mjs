const SAMPLE_IDS = new Set(['sea-cat', 'rainy-window', 'night-lantern']);
const IMAGE_FIELDS = ['image', 'imageUrl', 'image_url', 'artworkUrl', 'artwork_url', 'thumbnail', 'src'];
const DEFAULT_ORIGIN = 'https://pixieed.jp';

function normalizedId(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function sampleFlag(value) {
  if (value === true || value === 1) return true;
  return typeof value === 'string' && ['true', '1'].includes(value.trim().toLowerCase());
}

function sampleImageUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  const origin = globalThis.location?.origin || DEFAULT_ORIGIN;
  try {
    const url = new URL(value.trim(), origin);
    if (url.origin !== origin) return false;
    const pathname = url.pathname.toLowerCase();
    return [...SAMPLE_IDS].some((id) => pathname === `/assets/artworks/${id}.jpg`);
  } catch {
    return false;
  }
}

export function isSampleWork(work) {
  if (!work || typeof work !== 'object' || Array.isArray(work)) return false;
  if (sampleFlag(work.sample) || SAMPLE_IDS.has(normalizedId(work.id))) return true;
  return IMAGE_FIELDS.some((field) => sampleImageUrl(work[field]));
}

export function isSaleWork(work) {
  if (!work || typeof work !== 'object' || Array.isArray(work)) return false;
  if (work.distribution_mode === 'paid' || work.post_kind === 'market' || work.kind === 'market-reference') return true;
  return ['sale_price_yen', 'salePriceYen'].some((field) => {
    const value = Number(work[field]);
    return Number.isFinite(value) && value > 0;
  });
}

function validCoordinate(value, limit) {
  return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) && Math.abs(Number(value)) <= limit;
}

export function hasExplicitMapPlacement(value) {
  if (!value || typeof value !== 'object') return false;
  const position = value.mapPosition;
  if (value.mapPositionSpace === 'world' && position && validCoordinate(position.x, 100) && validCoordinate(position.y, 100)) return true;
  const location = value.location || value;
  return validCoordinate(location.latitude ?? location.lat, 90)
    && validCoordinate(location.longitude ?? location.lng ?? location.lon, 180);
}

export function publicWorksOnly(list) {
  if (!Array.isArray(list)) return [];
  return list.filter((work) => work && typeof work === 'object' && !Array.isArray(work) &&
    typeof work.id === 'string' && work.id.trim().length > 0 && !isSampleWork(work) && !isSaleWork(work));
}
