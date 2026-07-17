(function () {
  'use strict';

  function formats(asset) {
    return Array.isArray(asset?.included_formats) && asset.included_formats.length ? asset.included_formats : [asset?.asset_format];
  }

  function tags(asset) {
    return Array.isArray(asset?.tags) ? asset.tags.filter((tag) => typeof tag === 'string' && tag.trim()).slice(0, 8) : [];
  }

  function formatGroup(value) {
    const format = String(value || 'pixiedraw-project');
    if (format === 'pixiedraw-project') return format;
    if (['gif', 'apng', 'sprite-sheet-png'].includes(format)) return 'animation';
    return 'image';
  }

  function numberOrNull(value) {
    if (value === '' || value === null || value === undefined) return null;
    const number = Number(value); return Number.isFinite(number) && number >= 0 ? number : null;
  }

  function filterAndSortAssets(assets, criteria = {}) {
    const query = String(criteria.query || '').trim().toLowerCase();
    const activeFormat = String(criteria.format || 'all');
    const activeTag = String(criteria.tag || 'all');
    const derivativeMode = String(criteria.derivative || 'all');
    const sortMode = String(criteria.sort || 'new');
    const minimum = numberOrNull(criteria.priceMin); const maximum = numberOrNull(criteria.priceMax);
    return [...(assets || [])].filter((asset) => {
      const assetTagValues = tags(asset);
      const formatMatch = activeFormat === 'all' || formats(asset).some((format) => formatGroup(format) === activeFormat);
      const tagMatch = activeTag === 'all' || assetTagValues.some((tag) => tag.toLowerCase() === activeTag.toLowerCase());
      const amount = Number(asset.sale_price_yen || 0);
      const priceMatch = (minimum === null || amount >= minimum) && (maximum === null || amount <= maximum);
      const derivativeMatch = derivativeMode === 'allowed' ? asset.series?.derivative_sales_allowed === true
        : derivativeMode === 'derivatives' ? Boolean(asset.parent_asset_id)
          : derivativeMode === 'roots' ? !asset.parent_asset_id : true;
      const popularDerivativeMatch = sortMode !== 'popular-derivatives' || Boolean(asset.parent_asset_id);
      const haystack = `${asset.title || ''} ${asset.description || ''} ${asset.creator_display_name || ''} ${assetTagValues.join(' ')}`.toLowerCase();
      return formatMatch && tagMatch && priceMatch && derivativeMatch && popularDerivativeMatch && (!query || haystack.includes(query));
    }).sort((left, right) => {
      if (sortMode === 'price-low') return Number(left.sale_price_yen || 0) - Number(right.sale_price_yen || 0);
      if (sortMode === 'price-high') return Number(right.sale_price_yen || 0) - Number(left.sale_price_yen || 0);
      if (sortMode === 'popular' || sortMode === 'popular-derivatives') {
        return Number(right.favorite_count || 0) - Number(left.favorite_count || 0) || String(right.published_at || '').localeCompare(String(left.published_at || ''));
      }
      if (sortMode === 'derivative-count') {
        return Number(right.derivative_count || 0) - Number(left.derivative_count || 0) || Number(right.favorite_count || 0) - Number(left.favorite_count || 0);
      }
      return String(right.published_at || '').localeCompare(String(left.published_at || ''));
    });
  }

  function collectTags(assets) {
    return Array.from(new Set((assets || []).flatMap(tags))).sort((left, right) => left.localeCompare(right, 'ja'));
  }

  window.PiXiEEDMarketDiscovery = Object.freeze({ collectTags, filterAndSortAssets, formatGroup, formats, tags });
})();
