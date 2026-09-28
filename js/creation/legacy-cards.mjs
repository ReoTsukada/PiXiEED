const SAFE_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/;

function safeId(value) {
  return typeof value === 'string' && SAFE_ID.test(value) ? value : null;
}

function safePath(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 2048) return null;
  const path = value.trim();
  if (path.startsWith('/') || path.includes('\\') || /[?#\s]/.test(path)) return null;
  const parts = path.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..')) return null;
  return path;
}

function safePublicUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    return url.href;
  } catch {
    const path = safePath(value);
    return path ? `/${path}` : null;
  }
}

function safeDate(value) {
  if (typeof value !== 'string' || !value.trim() || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value).toISOString();
}

function safeLabel(value) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 240) : null;
}

function card({ source, id, kind, title, author, publishedAt, image, reuseAllowed = false, target = null, priceYen = null }) {
  if (!id || !title || !publishedAt || (!image && kind !== 'market-reference')) return null;
  return Object.freeze({
    source, id, kind, title, author: author || null, publishedAt, image,
    reuseAllowed: reuseAllowed === true, target, priceYen,
  });
}

function rowPublished(row) {
  return row?.status === 'published';
}

function identity(cardModel) {
  if (cardModel.kind === 'pixfind') return `pixfind:${cardModel.id}`;
  if (cardModel.kind === 'market-reference') return `market:${cardModel.target.id}`;
  return `${cardModel.source}:${cardModel.id}`;
}

/** Pure projection of legacy rows into safe public card models. Invalid rows are omitted. */
export function adaptLegacyCards({ socialPosts = [], pixfindPuzzles = [], marketAssets = [], marketPublicCatalog = [], userPosts = [] } = {}) {
  const puzzles = new Map(pixfindPuzzles.filter((row) => safeId(row?.id)).map((row) => [row.id, row]));
  const markets = new Map(marketAssets.filter((row) => safeId(row?.id)).map((row) => [row.id, row]));
  const publicMarkets = new Map(marketPublicCatalog.filter((row) => safeId(row?.id)).map((row) => [row.id, row]));
  const cards = [];
  const seen = new Set();

  const add = (model) => {
    if (!model) return;
    const key = identity(model);
    if (seen.has(key)) return;
    seen.add(key);
    cards.push(model);
  };

  for (const row of socialPosts) {
    if (!rowPublished(row) || !safeId(row.id)) continue;
    if (row.post_kind === 'image' && row.distribution_mode === 'showcase') {
      add(card({ source: 'social_posts', id: row.id, kind: 'showcase', title: safeLabel(row.title) || safeLabel(row.caption), author: safeLabel(row.creator_display_name), publishedAt: safeDate(row.published_at), image: safePath(row.media_object_path) }));
    } else if (row.post_kind === 'pixfind' && row.distribution_mode === 'pixfind') {
      const puzzle = puzzles.get(row.pixfind_puzzle_id);
      const puzzleId = safeId(puzzle?.id);
      const image = safePublicUrl(puzzle?.thumbnail_url) || safePublicUrl(puzzle?.original_url);
      add(card({ source: 'pixfind_puzzles', id: puzzleId, kind: 'pixfind', title: safeLabel(puzzle?.label), author: safeLabel(puzzle?.author_name), publishedAt: safeDate(row.published_at), image, target: puzzleId && safeLabel(puzzle?.slug) ? { id: puzzleId, slug: safeLabel(puzzle.slug) } : null }));
    } else if (row.post_kind === 'market' && row.distribution_mode === 'paid') {
      const publicAsset = publicMarkets.get(row.market_asset_id);
      if (publicAsset) {
        const assetId = safeId(publicAsset.id);
        const price = Number.isSafeInteger(publicAsset.sale_price_yen) && publicAsset.sale_price_yen > 0 ? publicAsset.sale_price_yen : null;
        if (!price) continue;
        add(card({ source: 'market_public_catalog_v1', id: assetId, kind: 'market-reference', title: safeLabel(publicAsset.title), author: safeLabel(publicAsset.creator_display_name), publishedAt: safeDate(publicAsset.published_at), image: null, target: assetId ? { id: assetId } : null, priceYen: price }));
      } else {
        const asset = markets.get(row.market_asset_id);
        if (!rowPublished(asset)) continue;
        const assetId = safeId(asset?.id);
        const image = safePath(asset?.preview_object_path);
        const price = Number.isSafeInteger(asset?.sale_price_yen) && asset.sale_price_yen > 0 ? asset.sale_price_yen : null;
        if (!image || !price) continue;
        add(card({ source: 'market_assets', id: assetId, kind: 'market-reference', title: safeLabel(asset?.title), author: safeLabel(asset?.creator_display_name), publishedAt: safeDate(asset?.published_at), image, target: assetId ? { id: assetId, status: asset.status } : null, priceYen: price }));
      }
    }
  }

  for (const row of userPosts) {
    if (!rowPublished(row) || !safeId(row.id)) continue;
    const mapPoint = row.post_map_point ?? row.post_map_points;
    if (Array.isArray(mapPoint)) continue;
    add(card({ source: 'user_posts', id: row.id, kind: 'map-artwork', title: safeLabel(row.title), author: safeLabel(row.author_display_name), publishedAt: safeDate(row.published_at), image: safePath(mapPoint?.public_image_path) }));
  }

  return cards;
}
