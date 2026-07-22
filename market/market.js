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
  const sellButton = document.getElementById('marketSellButton');
  const fallbackIcon = '../assets/icons/Market.png';
  const favorites = window.PiXiEEDMarketFavorites;
  const discovery = window.PiXiEEDMarketDiscovery;
  const INITIAL_RENDER_COUNT = 24;
  const RENDER_STEP = 24;
  let assets = [];
  let activeFilter = 'all';
  let renderLimit = INITIAL_RENDER_COUNT;
  let catalogClient = null;
  let loadMoreObserver = null;
  const requestedPreviewIds = new Set();
  const pendingPreviewIds = new Set();

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
    if (asset?.withdrawn_at) return true;
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
    if (asset.ai_usage_status === 'used' || asset.ai_usage_status === 'not-used') {
      const ai = document.createElement('span');
      ai.textContent = asset.ai_usage_status === 'used' ? 'AI使用あり' : 'AI使用なし';
      badges.appendChild(ai);
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
    // 新規出品の静的SEOページは公開時点では未生成のため、常設の詳細画面へ遷移する。
    const href = `item.html?id=${encodeURIComponent(asset.id)}`;
    const preview = document.createElement('div'); preview.className = 'market-card__preview';
    const previewLink = document.createElement('a'); previewLink.href = href;
    previewLink.setAttribute('aria-label', `${asset.title || '名称未設定の素材'}の商品詳細`);
    const image = new Image();
    const previewUrl = asset.preview_url || asset.preview_object_path;
    image.src = /^https?:\/\//i.test(previewUrl || '') ? previewUrl : fallbackIcon;
    image.alt = ''; image.draggable = false; image.loading = 'lazy'; image.decoding = 'async';
    image.dataset.marketProtectedMedia = 'true'; previewLink.appendChild(image); preview.appendChild(previewLink);
    if (isSoldOut(asset)) {
      const soldOut = document.createElement('span'); soldOut.className = 'market-card__soldout'; soldOut.textContent = 'SOLD OUT';
      preview.appendChild(soldOut);
    }
    const favorite = document.createElement('button'); favorite.type = 'button'; favorite.className = 'market-favorite-button market-card__favorite';
    favorites?.bind?.(favorite, asset); preview.appendChild(favorite);

    const body = document.createElement('div'); body.className = 'market-card__body';
    const title = document.createElement('h3');
    const titleLink = document.createElement('a'); titleLink.href = href; titleLink.textContent = asset.title || '名称未設定の素材'; title.appendChild(titleLink);
    const author = document.createElement('p'); author.className = 'market-card__author';
    const authorName = asset.creator_display_name || 'PiXiEEDクリエイター';
    const profileUrlValue = asset.creator_profile_url || asset.creator_x_url || asset.x_url || '';
    const profileUrl = /^https?:\/\//i.test(String(profileUrlValue).trim()) ? String(profileUrlValue).trim() : '';
    if (profileUrl) {
      const link = document.createElement('a'); link.href = profileUrl; link.target = '_blank'; link.rel = 'noopener noreferrer';
      link.textContent = `作者 ${authorName}`; link.setAttribute('aria-label', `${authorName}のプロフィールを開く`); author.appendChild(link);
    } else {
      author.textContent = `作者 ${authorName}`;
    }
    const badges = createVerificationBadges(asset);
    const meta = document.createElement('div'); meta.className = 'market-card__meta';
    const format = document.createElement('span'); format.className = 'market-card__format'; format.textContent = assetFormats(asset).map(formatLabel).join(' / ');
    const price = document.createElement('strong'); price.className = 'market-card__price'; price.textContent = `合計 ${formatPrice(asset.sale_price_yen)}`; meta.append(format, price);
    const stats = document.createElement('div'); stats.className = 'market-card__stats';
    if (Number(asset.derivative_count) > 0) {
      const derivatives = document.createElement('span'); derivatives.textContent = `派生 ${Number(asset.derivative_count).toLocaleString('ja-JP')}`; stats.appendChild(derivatives);
    }
    if (asset.series?.derivative_sales_allowed === true) {
      const allowed = document.createElement('span'); allowed.className = 'is-derivative-ok'; allowed.textContent = '改変・素材再販売OK'; stats.appendChild(allowed);
    }
    if (asset.withdrawn_at) {
      const withdrawn = document.createElement('span'); withdrawn.className = 'is-sold-out'; withdrawn.textContent = '出品取り下げ・売り切れ';
      stats.appendChild(withdrawn);
    } else if (Number.isInteger(Number(asset.limited_quantity)) && Number(asset.limited_quantity) > 0) {
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

  function visibleAssets() {
    return discovery.filterAndSortAssets(assets, {
      query: search?.value || '', format: activeFilter, tag: 'all',
      derivative: derivativeFilter?.value || 'all', sort: sort?.value || 'new',
      priceMin: priceMin?.value || '', priceMax: priceMax?.value || ''
    });
  }

  function resetRenderLimit() {
    renderLimit = INITIAL_RENDER_COUNT;
  }

  function observeLoadMore(marker) {
    loadMoreObserver?.disconnect();
    if (!(marker instanceof HTMLElement)) return;
    if (typeof IntersectionObserver !== 'function') {
      marker.hidden = false;
      marker.addEventListener('click', () => { renderLimit += RENDER_STEP; render(); }, { once: true });
      return;
    }
    loadMoreObserver = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      loadMoreObserver?.disconnect();
      renderLimit += RENDER_STEP;
      render();
    }, { rootMargin: '700px 0px' });
    loadMoreObserver.observe(marker);
  }

  async function loadPreviewUrls(client, candidates) {
    const targets = candidates.filter((asset) => {
      const id = String(asset?.id || '');
      return id && !requestedPreviewIds.has(id) && !pendingPreviewIds.has(id);
    });
    if (!client || !targets.length) return false;
    targets.forEach((asset) => pendingPreviewIds.add(asset.id));
    try {
      const { data, error } = await client.functions.invoke('market-public-preview', {
        body: { asset_ids: targets.map((asset) => asset.id) }
      });
      if (error || !data?.previews || typeof data.previews !== 'object') return false;
      targets.forEach((asset) => {
        requestedPreviewIds.add(asset.id);
        const previewUrl = data.previews[asset.id];
        if (typeof previewUrl === 'string' && /^https?:\/\//i.test(previewUrl)) asset.preview_url = previewUrl;
      });
      return true;
    } finally {
      targets.forEach((asset) => pendingPreviewIds.delete(asset.id));
    }
  }

  function requestVisiblePreviews(visible) {
    if (!catalogClient) return;
    void loadPreviewUrls(catalogClient, visible).then((updated) => {
      if (updated) render();
    });
  }

  function render() {
    const visible = visibleAssets();
    const shown = visible.slice(0, renderLimit);
    count.textContent = shown.length === visible.length ? `${visible.length}件` : `${shown.length}/${visible.length}件`;
    if (!visible.length) {
      renderEmpty(assets.length ? '条件に合う素材がありません' : '公開中の素材はまだありません', assets.length ? '検索語、価格、派生条件を変えてお試しください。' : '出品された素材はここへ表示されます。');
      return;
    }
    const children = [];
    shown.forEach((asset, index) => {
      children.push(createCard(asset));
      if ((index + 1) % 8 !== 0) return;
      const listAd = window.PiXiEEDMarketAds?.createListAd?.();
      if (listAd) children.push(listAd);
    });
    if (shown.length < visible.length) {
      const marker = document.createElement('button');
      marker.type = 'button'; marker.className = 'market-load-more'; marker.textContent = '続きを読み込む';
      marker.setAttribute('aria-label', `残り${visible.length - shown.length}件を読み込む`);
      children.push(marker);
      window.requestAnimationFrame(() => observeLoadMore(marker));
    } else {
      loadMoreObserver?.disconnect();
    }
    grid.replaceChildren(...children);
    requestVisiblePreviews(shown);
  }

  async function loadAssets() {
    // 公開一覧は認証不要。ログイン確認を待たずに商品カードを先に出す。
    const client = window.PiXiEEDMarketAccess
      ? await window.PiXiEEDMarketAccess.getClient().catch(() => null)
      : null;
    if (!client) {
      renderEmpty('マーケットを読み込めませんでした', '通信状態を確認して再読み込みしてください。');
      return;
    }
    try {
      const { data, error } = await client.rpc('market_public_catalog_v1', { input_limit: 120 });
      if (error) throw error;
      const remoteAssets = Array.isArray(data) ? data : [];
      assets = remoteAssets;
      catalogClient = client;
      render();
      // お気に入りだけは初期描画を妨げない後続処理にする。
      void Promise.resolve(favorites?.prepare?.(remoteAssets)).then(() => {
        if (assets === remoteAssets) render();
      });
    } catch (_error) {
      assets = [];
      render();
    }
  }

  search?.addEventListener('input', () => { resetRenderLimit(); render(); });
  sort?.addEventListener('change', () => { if (sort.value === 'popular-derivatives') advancedSearch.open = true; resetRenderLimit(); render(); });
  derivativeFilter?.addEventListener('change', () => { resetRenderLimit(); render(); });
  priceMin?.addEventListener('input', () => { resetRenderLimit(); render(); });
  priceMax?.addEventListener('input', () => { resetRenderLimit(); render(); });
  filters?.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-filter]'); if (!button) return;
    activeFilter = button.dataset.filter || 'all';
    filters.querySelectorAll('button').forEach((item) => item.classList.toggle('is-active', item === button));
    resetRenderLimit(); render();
  });
  filterReset?.addEventListener('click', () => {
    search.value = ''; sort.value = 'new'; derivativeFilter.value = 'all'; priceMin.value = ''; priceMax.value = '';
    activeFilter = 'all';
    filters.querySelectorAll('button').forEach((button) => button.classList.toggle('is-active', button.dataset.filter === 'all'));
    resetRenderLimit();
    render();
  });
  sellButton?.addEventListener('click', async (event) => {
    event.preventDefault();
    const targetUrl = new URL(sellButton.href, window.location.href);
    const access = window.PiXiEEDMarketAccess
      ? await window.PiXiEEDMarketAccess.check({ refresh: true })
      : { allowed: false };
    if (access.allowed) {
      window.location.assign(targetUrl.href);
      return;
    }
    const shouldLogin = window.confirm(
      '出品するにはログインが必要です。\nログインページへ進みますか？'
    );
    if (!shouldLogin) {
      return;
    }
    const accountUrl = new URL('../account/index.html', window.location.href);
    accountUrl.searchParams.set('returnTo', targetUrl.href);
    window.location.assign(accountUrl.href);
  });
  loadAssets();
})();
