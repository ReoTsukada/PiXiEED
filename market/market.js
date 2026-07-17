(function () {
  'use strict';

  const SUPABASE_URL = 'https://kyyiuakrqomzlikfaire.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_gnc61sD2hZvGHhEW8bQMoA_lrL07SN4';
  const grid = document.getElementById('marketGrid');
  const count = document.getElementById('marketCount');
  const search = document.getElementById('marketSearch');
  const filters = document.getElementById('marketFilters');
  const sort = document.getElementById('marketSort');
  const derivativeFilter = document.getElementById('marketDerivativeFilter');
  const priceMin = document.getElementById('marketPriceMin');
  const priceMax = document.getElementById('marketPriceMax');
  const filterReset = document.getElementById('marketFilterReset');
  const advancedSearch = document.getElementById('marketAdvancedSearch');
  const fallbackIcon = '../Market.png';
  const favorites = window.PiXiEEDMarketFavorites;
  const discovery = window.PiXiEEDMarketDiscovery;
  const localTestCatalog = window.PiXiEEDMarketLocalTestProducts || null;
  let localTestProducts = [];
  let assets = [];
  let activeFilter = 'all';

  function formatPrice(value) {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return '価格未設定';
    if (amount < 500) return '販売停止中';
    return `${new Intl.NumberFormat('ja-JP').format(amount)}円`;
  }

  function assetFormats(asset) {
    return Array.isArray(asset.included_formats) && asset.included_formats.length ? asset.included_formats : [asset.asset_format];
  }

  function isPixieeDrawProduct(asset) {
    return assetFormats(asset).includes('pixiedraw-project');
  }

  function isSoldOut(asset) {
    const quantity = Number(asset?.limited_quantity);
    return Number.isInteger(quantity) && quantity > 0 && Number(asset?.limited_sold_count || 0) >= quantity;
  }

  function formatLabel(value) {
    const labels = {
      'pixiedraw-project': 'PiXiEEDraw', png: 'PNG', webp: 'WebP', gif: 'GIF', apng: 'APNG',
      'sprite-sheet-png': 'スプライトシート'
    };
    return labels[String(value || '')] || '画像素材';
  }

  function createVerificationBadges(asset) {
    const badges = document.createElement('div'); badges.className = 'market-card__badges';
    const productType = document.createElement('span');
    productType.className = isPixieeDrawProduct(asset) ? 'is-pixiedraw-product' : 'is-general-product';
    productType.textContent = isPixieeDrawProduct(asset) ? 'PiXiEEDraw作品' : '一般素材';
    badges.appendChild(productType);
    if (asset.local_test === true) {
      const local = document.createElement('span'); local.textContent = 'DEVテスト'; badges.appendChild(local); return badges;
    }
    if (asset.verification_status === 'verified') {
      const source = document.createElement('span'); source.textContent = asset.source_kind === 'pixieed-native' ? 'PiXiEED形式' : '外部形式';
      const review = document.createElement('span'); review.textContent = '出品審査済み'; badges.append(source, review);
    }
    if (asset.seller_identity_verified === true) {
      const seller = document.createElement('span'); seller.textContent = '販売者確認済み'; badges.appendChild(seller);
    }
    return badges;
  }

  function renderEmpty(title, detail) {
    const article = document.createElement('article'); article.className = 'market-empty';
    const image = new Image(); image.src = fallbackIcon; image.alt = '';
    const strong = document.createElement('strong'); strong.textContent = title;
    const span = document.createElement('span'); span.textContent = detail;
    article.append(image, strong, span); grid.replaceChildren(article);
  }

  function createCard(asset) {
    const card = document.createElement('article'); card.className = 'market-card';
    card.classList.toggle('is-sold-out', isSoldOut(asset));
    if (asset.local_test === true) card.dataset.localTestProduct = 'true';
    const href = `item.html?id=${encodeURIComponent(asset.id)}`;
    const preview = document.createElement('div'); preview.className = 'market-card__preview';
    const previewLink = document.createElement('a'); previewLink.href = href;
    previewLink.setAttribute('aria-label', `${asset.title || '名称未設定の素材'}の商品詳細`);
    const image = new Image();
    image.src = asset.local_test === true && asset.preview_object_path
      ? asset.preview_object_path
      : (/^https?:\/\//i.test(asset.preview_object_path || '') ? asset.preview_object_path : fallbackIcon);
    image.alt = ''; image.draggable = false; image.dataset.marketProtectedMedia = 'true'; previewLink.appendChild(image); preview.appendChild(previewLink);
    if (isSoldOut(asset)) {
      const soldOut = document.createElement('span'); soldOut.className = 'market-card__soldout'; soldOut.textContent = 'SOLD OUT';
      preview.appendChild(soldOut);
    }
    const favorite = document.createElement('button'); favorite.type = 'button'; favorite.className = 'market-favorite-button market-card__favorite';
    favorites?.bind?.(favorite, asset); preview.appendChild(favorite);

    const body = document.createElement('div'); body.className = 'market-card__body';
    const title = document.createElement('h3');
    const titleLink = document.createElement('a'); titleLink.href = href; titleLink.textContent = asset.title || '名称未設定の素材'; title.appendChild(titleLink);
    const author = document.createElement('p'); author.className = 'market-card__author'; author.textContent = `作者 ${asset.creator_display_name || 'PiXiEEDクリエイター'}`;
    const badges = createVerificationBadges(asset);
    const meta = document.createElement('div'); meta.className = 'market-card__meta';
    const format = document.createElement('span'); format.className = 'market-card__format'; format.textContent = assetFormats(asset).map(formatLabel).join(' / ');
    const price = document.createElement('strong'); price.className = 'market-card__price'; price.textContent = `合計 ${formatPrice(asset.sale_price_yen)}`; meta.append(format, price);
    const stats = document.createElement('div'); stats.className = 'market-card__stats';
    if (Number(asset.derivative_count) > 0) {
      const derivatives = document.createElement('span'); derivatives.textContent = `派生 ${Number(asset.derivative_count).toLocaleString('ja-JP')}`; stats.appendChild(derivatives);
    }
    if (asset.series?.derivative_sales_allowed === true) {
      const allowed = document.createElement('span'); allowed.className = 'is-derivative-ok'; allowed.textContent = '派生OK'; stats.appendChild(allowed);
    }
    if (Number.isInteger(Number(asset.limited_quantity)) && Number(asset.limited_quantity) > 0) {
      const limited = document.createElement('span'); limited.className = isSoldOut(asset) ? 'is-sold-out' : 'is-limited';
      const remaining = Math.max(0, Number(asset.limited_quantity) - Number(asset.limited_sold_count || 0));
      limited.textContent = isSoldOut(asset) ? '限定・売り切れ' : `先着${Number(asset.limited_quantity).toLocaleString('ja-JP')}名・残り${remaining.toLocaleString('ja-JP')}`;
      stats.appendChild(limited);
    }
    body.append(title, author);
    if (badges.childElementCount) body.appendChild(badges);
    body.append(meta);
    if (stats.childElementCount) body.appendChild(stats);
    card.append(preview, body); return card;
  }

  function render() {
    const visible = discovery.filterAndSortAssets(assets, {
      query: search?.value || '', format: activeFilter, tag: 'all',
      derivative: derivativeFilter?.value || 'all', sort: sort?.value || 'new',
      priceMin: priceMin?.value || '', priceMax: priceMax?.value || ''
    });
    count.textContent = visible.length === assets.length ? `${visible.length}件` : `${visible.length}/${assets.length}件`;
    if (!visible.length) {
      renderEmpty(assets.length ? '条件に合う素材がありません' : '公開中の素材はまだありません', assets.length ? '検索語、価格、派生条件を変えてお試しください。' : '出品された素材はここへ表示されます。');
      return;
    }
    grid.replaceChildren(...visible.map(createCard));
  }

  async function loadAssets() {
    const access = window.PiXiEEDDevAccess
      ? await window.PiXiEEDDevAccess.check()
      : { allowed: false, client: null };
    if (!access.client) {
      renderEmpty('マーケットを読み込めませんでした', '通信状態を確認して再読み込みしてください。');
      return;
    }
    await localTestCatalog?.ready;
    localTestProducts = Array.isArray(localTestCatalog?.products) ? [...localTestCatalog.products] : [];
    try {
      const { data, error } = await access.client.rpc('market_public_catalog_v1', { input_limit: 120 });
      if (error) throw error;
      const remoteAssets = Array.isArray(data) ? data : [];
      const localIds = new Set(localTestProducts.map((asset) => asset.id));
      assets = [...localTestProducts, ...remoteAssets.filter((asset) => !localIds.has(asset.id))];
    } catch (_error) {
      assets = [...localTestProducts];
    }
    await favorites?.prepare?.(assets);
    render();
  }

  search?.addEventListener('input', render);
  sort?.addEventListener('change', () => { if (sort.value === 'popular-derivatives') advancedSearch.open = true; render(); });
  derivativeFilter?.addEventListener('change', render);
  priceMin?.addEventListener('input', render); priceMax?.addEventListener('input', render);
  filters?.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-filter]'); if (!button) return;
    activeFilter = button.dataset.filter || 'all';
    filters.querySelectorAll('button').forEach((item) => item.classList.toggle('is-active', item === button)); render();
  });
  filterReset?.addEventListener('click', () => {
    search.value = ''; sort.value = 'new'; derivativeFilter.value = 'all'; priceMin.value = ''; priceMax.value = '';
    activeFilter = 'all';
    filters.querySelectorAll('button').forEach((button) => button.classList.toggle('is-active', button.dataset.filter === 'all'));
    render();
  });
  loadAssets();
})();
