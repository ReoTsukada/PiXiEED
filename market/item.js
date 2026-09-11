(function () {
  'use strict';

  const SUPABASE_URL = 'https://kyyiuakrqomzlikfaire.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_gnc61sD2hZvGHhEW8bQMoA_lrL07SN4';
  const $ = (id) => document.getElementById(id);
  const labels = {
    'pixiedraw-project': 'iDRAW', png: 'PNG', webp: 'WebP', gif: 'GIF', apng: 'APNG',
    'sprite-sheet-png': 'PNGスプライトシート',
    'novel-json': '小説・世界観', text: 'テキスト', markdown: 'Markdown', html: 'HTML', csv: 'CSV', rtf: 'RTF', json: 'JSON',
    mp4: 'MP4動画', webm: 'WebM動画', mov: 'QuickTime動画', m4v: 'M4V動画', ogv: 'Ogg動画',
    aac: 'AAC', aiff: 'AIFF', flac: 'FLAC', m4a: 'M4A', mid: 'MIDI', midi: 'MIDI',
    mp3: 'MP3', oga: 'OGA', ogg: 'OGG', opus: 'Opus', wav: 'WAV', weba: 'WebM音声'
  };
  const yen = (value) => Number(value || 0) === 0 ? '無料' : `${Number(value || 0).toLocaleString('ja-JP')}円`;
  let currentAsset = null;
  let purchaseClient = null;
  let purchaseUser = null;
  const favorites = window.PiXiEEDMarketFavorites;
  const RELATED_PAGE_SIZE = 9;
  const RELATED_MAX = 18;
  let relatedSets = {};
  let relatedKind = 'derivative';
  let relatedLimit = RELATED_PAGE_SIZE;
  const MARKET_PROJECT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
  const MARKET_GAME_TARGET_KEY = 'pixieed:market-igame-target:v1';
  let gameUseAvailable = false;
  let gameUseBusy = false;

  function currentAssetId() {
    const queryId = new URLSearchParams(location.search).get('id');
    if (queryId) return queryId;
    const match = location.pathname.match(/\/market\/items\/([0-9a-f-]{36})\/?$/i);
    return match?.[1] || '';
  }

  function embeddedSeoAsset(id) {
    const node = document.getElementById('marketSeoAsset');
    if (!node?.textContent) return null;
    try {
      const asset = JSON.parse(node.textContent);
      return String(asset?.id || '') === id ? asset : null;
    } catch (_error) {
      return null;
    }
  }

  async function loadPublicAsset(id) {
    const embedded = embeddedSeoAsset(id);
    const pending = window.__PIXIEED_MARKET_PUBLIC_ASSET_PROMISE__;
    if (pending) return pending;
    // 新しい公開専用フラグが埋め込まれている静的ページはそのまま使う。
    // 旧SEOページにはフラグがないため、現行RPCを確認して誤って購入導線を
    // 表示しない。通信できない場合だけ、従来の静的商品情報へ戻す。
    if (embedded && Object.prototype.hasOwnProperty.call(embedded, 'acquisition_enabled')) return embedded;
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/market_public_asset_v1`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ input_asset_id: id })
      });
      if (!response.ok) throw new Error(`market_public_asset_v1 failed: ${response.status}`);
      return await response.json();
    } catch (error) {
      if (embedded) return embedded;
      throw error;
    }
  }

  async function loadPublicPreview(assetId) {
    const pending = window.__PIXIEED_MARKET_PUBLIC_PREVIEW_PROMISE__;
    if (pending) return pending;
    const response = await fetch(`${SUPABASE_URL}/functions/v1/market-public-preview`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ asset_ids: [assetId] })
    });
    if (!response.ok) throw new Error(`market-public-preview failed: ${response.status}`);
    return response.json();
  }

  function assetFormats(asset) {
    return Array.isArray(asset?.included_formats) && asset.included_formats.length ? asset.included_formats : [asset?.asset_format];
  }

  function isPixieeDrawProduct(asset) {
    return assetFormats(asset).includes('pixiedraw-project');
  }

  function isSoldOut(asset) {
    if (asset?.withdrawn_at) return true;
    const quantity = Number(asset?.limited_quantity);
    return Number.isInteger(quantity) && quantity > 0 && Number(asset?.limited_sold_count || 0) >= quantity;
  }

  function isAcquisitionEnabled(asset) {
    // 古い静的商品データには列がないため、未定義は従来どおり取得可能として扱う。
    return asset?.acquisition_enabled !== false;
  }

  function badge(text) {
    const node = document.createElement('span'); node.textContent = text; return node;
  }

  function externalProfileUrl(value) {
    const url = String(value || '').trim();
    return /^https?:\/\//i.test(url) ? url : '';
  }

  async function copyCurrentAssetUrl() {
    if (!currentAsset) return;
    const url = document.querySelector('link[rel="canonical"]')?.href || window.location.href;
    try {
      if (navigator.clipboard?.writeText && window.isSecureContext) {
        await navigator.clipboard.writeText(url);
      } else {
        const input = document.createElement('textarea');
        input.value = url;
        input.setAttribute('readonly', '');
        input.style.cssText = 'position:fixed;opacity:0;pointer-events:none;';
        document.body.appendChild(input);
        input.select();
        const copied = document.execCommand('copy');
        input.remove();
        if (!copied) throw new Error('copy_failed');
      }
      window.alert('商品URLをコピーしました');
    } catch (_error) {
      window.alert('URLをコピーできませんでした。ブラウザの設定を確認して、もう一度お試しください。');
    }
  }

  function renderSamplePreviews(asset) {
    // メインのサムネイルはここへ重複表示しない。試聴で選択された画像だけを並べる。
    const urls = (Array.isArray(asset.sample_preview_urls) ? asset.sample_preview_urls : [])
      .filter((url) => /^https?:\/\//i.test(url || ''))
      .filter((url, index, all) => all.indexOf(url) === index);
    const container = $('itemSamplePreviews');
    const controls = $('itemPreviewControls');
    const frame = $('itemPreviewFrame');
    controls.hidden = urls.length === 0;
    frame.classList.remove('is-sample-preview');
    container.replaceChildren(...urls.map((url, index) => {
      const button = document.createElement('button'); button.type = 'button';
      button.className = 'market-item__sample-preview';
      button.setAttribute('aria-label', `試聴プレビュー ${index + 1} を表示`);
      const image = new Image(); image.src = url; image.alt = ''; image.loading = 'lazy'; image.decoding = 'async';
      image.draggable = false; image.dataset.marketProtectedMedia = 'true';
      button.appendChild(image);
      button.addEventListener('click', () => {
        $('itemPreview').src = url;
        $('itemPreview').alt = `${asset.title || '商品'}の試聴プレビュー ${index + 1}`;
        // 旧プレビューだけは保護のため表示レイヤーを残す。baked-v5 は画像内に
        // 焼き込み済みなので二重に重ねない。
        frame.classList.toggle('is-sample-preview', asset.sample_watermark_baked !== true);
        container.querySelectorAll('button').forEach((node) => node.classList.toggle('is-active', node === button));
      });
      return button;
    }));
  }

  // 商品本文は署名付きプレビューURLやログイン確認を待たずに表示する。
  // プレビューURLだけは後から届くため、この小さな更新に閉じ込めて、
  // ページ全体の再描画・イベント再登録を発生させない。
  function renderPreviewMedia(asset) {
    // 元画像URLが混ざっていても公開しない。market-public-preview が返す
    // 透かし入りサムネイルだけをメインビューへ渡す。
    const previewUrl = asset.marketPreviewReady ? asset.preview_url : '';
    if (/^https?:\/\//i.test(previewUrl || '')) {
      $('itemPreview').src = previewUrl;
    }
    $('itemPreview').alt = `${asset.title || '商品'}のプレビュー`;
    renderSamplePreviews(asset);
  }

  function render(asset) {
    currentAsset = asset;
    gameUseAvailable = false;
    renderGameUseAction();
    const series = asset.series || {};
    const formats = assetFormats(asset);
    const hasAudio = formats.some((format) => ['aac', 'aiff', 'flac', 'm4a', 'mid', 'midi', 'mp3', 'oga', 'ogg', 'opus', 'wav', 'weba'].includes(format));
    const hasDraw = formats.some((format) => ['pixiedraw-project', 'png', 'webp', 'gif', 'apng', 'sprite-sheet-png'].includes(format));
    const hasText = formats.some((format) => ['novel-json', 'text', 'markdown', 'html', 'csv', 'rtf', 'json'].includes(format));
    const hasVideo = formats.some((format) => ['mp4', 'webm', 'mov', 'm4v', 'ogv'].includes(format));
    const options = series.inherited_terms?.license_options || [];
    document.title = `${asset.title} | PiXiEEDマーケット`;
    const canonical = document.querySelector('link[rel="canonical"]');
    if (canonical) canonical.href = `https://pixieed.jp/market/items/${encodeURIComponent(asset.id)}/`;
    $('itemTitle').textContent = asset.title || '名称未設定の素材';
    $('itemDescription').textContent = asset.description || '説明はありません。';
    $('itemPrice').textContent = isAcquisitionEnabled(asset) ? yen(asset.sale_price_yen) : '公開のみ';
    $('itemFormats').textContent = formats.map((format) => labels[format] || format).join(' / ');
    $('itemProductType').textContent = isPixieeDrawProduct(asset)
      ? 'iDRAW作品（編集用プロジェクト入り）'
      : hasAudio && hasDraw
        ? 'iDRAW + iAUDIO素材（絵と音楽）'
        : hasText && hasVideo
          ? '文章・世界観 + 動画素材'
          : hasText && hasDraw
            ? '文章・世界観 + 画像素材'
            : hasText
              ? '文章・世界観素材'
              : hasVideo && hasAudio
                ? '動画 + iAUDIO素材'
                : hasVideo
                  ? '動画素材'
        : hasAudio
          ? 'iAUDIO素材（音楽・SE）'
          : '一般素材（画像・アニメーション）';
    const limitedQuantity = Number(asset.limited_quantity);
    const limitedSold = Math.max(0, Number(asset.limited_sold_count || 0));
    $('itemAvailability').textContent = !isAcquisitionEnabled(asset)
      ? '公開のみ・取得不可'
      : asset.withdrawn_at
      ? '出品者による取り下げ・売り切れ'
      : Number.isInteger(limitedQuantity) && limitedQuantity > 0
      ? (isSoldOut(asset) ? `先着${limitedQuantity.toLocaleString('ja-JP')}名・売り切れ` : `先着${limitedQuantity.toLocaleString('ja-JP')}名・残り${Math.max(0, limitedQuantity - limitedSold).toLocaleString('ja-JP')}`)
      : '販売数の制限なし';
    $('itemPreviewFrame').classList.toggle('is-sold-out', isSoldOut(asset));
    $('itemSoldOut').hidden = !isSoldOut(asset);
    $('itemDerivative').textContent = series.derivative_sales_allowed
      ? 'OK（改変した素材を独立商品として再販売可能・系列ロイヤリティーあり）'
      : 'NG（利用・改変できる範囲でも、素材または改変素材として再販売できません）';
    renderPreviewMedia(asset);
    $('itemShare').onclick = () => { copyCurrentAssetUrl(); };
    const author = $('itemAuthor');
    author.textContent = `作者: ${asset.creator_display_name || 'PiXiEEDクリエイター'}`;
    const profileUrl = externalProfileUrl(asset.creator_profile_url || asset.creator_x_url || asset.x_url);
    if (profileUrl) {
      author.href = profileUrl;
      author.target = '_blank';
      author.rel = 'noopener noreferrer';
      author.setAttribute('aria-label', `${asset.creator_display_name || '作者'}のプロフィールを開く`);
    } else {
      author.removeAttribute('href');
      author.removeAttribute('target');
      author.removeAttribute('rel');
      author.removeAttribute('aria-label');
    }
    favorites?.bind?.($('itemFavorite'), asset);
    const productBadge = badge(isPixieeDrawProduct(asset) ? 'iDRAW作品' : '一般素材');
    productBadge.className = isPixieeDrawProduct(asset) ? 'is-pixiedraw-product' : 'is-general-product';
    const badges = [productBadge];
    if (asset.verification_status === 'verified') {
      badges.push(badge(asset.source_kind === 'pixieed-native' ? 'PiXiEED形式' : '外部形式'), badge('出品審査済み'));
    }
    if (asset.seller_identity_verified) badges.push(badge('販売者確認済み'));
    if (asset.ai_usage_status === 'used' || asset.ai_usage_status === 'not-used') {
      badges.push(badge(asset.ai_usage_status === 'used' ? 'AI使用あり' : 'AI使用なし'));
    }
    $('itemBadges').replaceChildren(...badges);
    window.PiXiEEDMarketPageviewRewards?.track?.(asset);
    $('itemOptions').replaceChildren(...(options.length ? options.map((option) => {
      const card = document.createElement('div');
      const title = document.createElement('strong'); title.textContent = option.label;
      const description = document.createElement('small'); description.textContent = option.description || '';
      card.append(title);
      if (description.textContent) card.append(description);
      return card;
    }) : [Object.assign(document.createElement('p'), { textContent: '追加オプションなし' })]));
    $('itemStatus').hidden = true; $('itemContent').hidden = false;
    window.PiXiEEDMarketAds?.showDetailAd?.();
  }

  function relatedCard(asset) {
    const card = document.createElement('article'); card.className = 'market-card';
    const link = document.createElement('a'); link.href = `/market/items/${encodeURIComponent(asset.id)}/`;
    const preview = document.createElement('div'); preview.className = 'market-card__preview';
    const image = new Image(); image.src = asset.preview_url || '../assets/icons/Market.png'; image.alt = ''; image.loading = 'lazy'; image.decoding = 'async'; image.draggable = false; image.dataset.marketProtectedMedia = 'true';
    preview.append(image); link.append(preview);
    const body = document.createElement('div'); body.className = 'market-card__body';
    const title = document.createElement('h3'); title.textContent = asset.title || '名称未設定の素材';
    const author = document.createElement('p'); author.className = 'market-card__author'; author.textContent = `作者 ${asset.creator_display_name || 'PiXiEEDクリエイター'}`;
    const price = document.createElement('strong'); price.className = 'market-card__price'; price.textContent = yen(asset.sale_price_yen);
    body.append(title, author, price); link.append(body); card.append(link); return card;
  }

  function renderRelated() {
    const section = $('itemRelated'); const grid = $('itemRelatedGrid');
    const assets = (relatedSets[relatedKind] || []).slice(0, relatedLimit);
    section.hidden = !assets.length;
    if (!assets.length) return;
    document.querySelectorAll('[data-related-kind]').forEach((button) => {
      const active = button.dataset.relatedKind === relatedKind;
      button.classList.toggle('is-active', active); button.setAttribute('aria-selected', String(active));
    });
    const nodes = [];
    assets.forEach((asset, index) => {
      nodes.push(relatedCard(asset));
      if ((index + 1) % 3 === 0 && index + 1 < assets.length) {
        const ad = window.PiXiEEDMarketAds?.createListAd?.(); if (ad) { ad.classList.add('market-ad--related'); nodes.push(ad); }
      }
    });
    grid.replaceChildren(...nodes);
    $('itemRelatedMore').hidden = (relatedSets[relatedKind] || []).length <= relatedLimit;
  }

  async function loadRelated(asset) {
    const { data, error } = await purchaseClient.rpc('market_public_catalog_v1', { input_limit: 120 });
    if (error || !Array.isArray(data)) return;
    const others = data.filter((entry) => entry?.id && entry.id !== asset.id);
    const tags = new Set((asset.tags || []).map((tag) => String(tag).toLowerCase()));
    const sortPopular = (left, right) => (Number(right.favorite_count || 0) + Number(right.derivative_count || 0) * 2) - (Number(left.favorite_count || 0) + Number(left.derivative_count || 0) * 2);
    relatedSets = {
      derivative: others.filter((entry) => entry.parent_asset_id === asset.id),
      popular: [...others].sort(sortPopular),
      creator: others.filter((entry) => entry.creator_display_name && entry.creator_display_name === asset.creator_display_name),
      tags: others.filter((entry) => (entry.tags || []).some((tag) => tags.has(String(tag).toLowerCase())))
    };
    const ids = Array.from(new Set(Object.values(relatedSets).flat().slice(0, RELATED_MAX).map((entry) => entry.id)));
    if (ids.length) {
      const { data: previews } = await purchaseClient.functions.invoke('market-public-preview', { body: { asset_ids: ids } });
      Object.values(relatedSets).flat().forEach((entry) => { const url = previews?.previews?.[entry.id]; if (/^https?:\/\//i.test(url || '')) entry.preview_url = url; });
    }
    relatedKind = relatedSets.derivative.length ? 'derivative' : relatedSets.tags.length ? 'tags' : relatedSets.creator.length ? 'creator' : 'popular';
    renderRelated();
  }

  function setPurchaseState({ disabled, label, status }) {
    $('itemPurchase').disabled = disabled;
    $('itemPurchase').textContent = label;
    $('itemPurchaseStatus').textContent = status;
  }

  function safeGameProjectId(value) {
    const candidate = String(value || '').trim();
    return MARKET_PROJECT_ID_PATTERN.test(candidate) ? candidate : '';
  }

  function safeGameProjectName(value) {
    const candidate = String(value || '').replace(/[\u0000-\u001f\u007f]/g, '').trim();
    return candidate ? candidate.slice(0, 80) : '無題のProject';
  }

  function localStorageValue(key) {
    try { return localStorage.getItem(key) || ''; } catch (_error) { return ''; }
  }

  function readGameProjects() {
    const params = new URLSearchParams(window.location.search);
    const projects = [];
    const seen = new Set();
    const add = (id, name) => {
      const projectId = safeGameProjectId(id);
      if (!projectId || seen.has(projectId)) return;
      seen.add(projectId);
      projects.push({ projectId, name: safeGameProjectName(name) });
    };
    let creatorStore = null;
    let shellState = null;
    let handoffTarget = null;
    try {
      const rawStore = localStorageValue('pixieed:creator-projects:v1');
      const parsedStore = rawStore ? JSON.parse(rawStore) : null;
      creatorStore = parsedStore && typeof parsedStore === 'object' ? parsedStore : null;
      const rawShell = localStorageValue('pixieed:creator-app-shell:v1');
      const parsedShell = rawShell ? JSON.parse(rawShell) : null;
      shellState = parsedShell && typeof parsedShell === 'object' ? parsedShell : null;
      const rawHandoff = localStorageValue(MARKET_GAME_TARGET_KEY);
      const parsedHandoff = rawHandoff ? JSON.parse(rawHandoff) : null;
      handoffTarget = parsedHandoff && typeof parsedHandoff === 'object' ? parsedHandoff : null;
    } catch (_error) {
      creatorStore = null;
      shellState = null;
    }
    const handoffAssetMatches = !currentAsset || handoffTarget?.assetId === currentAsset.id;
    const requestedId = safeGameProjectId(
      params.get('projectId') || params.get('project') ||
        (handoffAssetMatches ? handoffTarget?.projectId : ''),
    );
    const requestedProject = requestedId && creatorStore?.projects?.[requestedId];
    add(requestedId, params.get('projectName') || requestedProject?.name || (handoffAssetMatches ? handoffTarget?.projectName : ''));
    const activeId = safeGameProjectId(
      localStorageValue('pixiedraw2:active-project-id:v1') ||
        localStorageValue('pixieed:creator-project-active:v1') ||
        creatorStore?.activeProjectId ||
        shellState?.projectId,
    );
    const activeProject = activeId && creatorStore?.projects?.[activeId];
    add(activeId, activeProject?.name || shellState?.projectName);
    if (creatorStore?.projects && typeof creatorStore.projects === 'object') {
      Object.values(creatorStore.projects).forEach((project) => {
        if (!project || typeof project !== 'object') return;
        add(project.projectId, project.name);
      });
    }
    if (projects.length === 0) add('local-project', '無題のProject');
    return projects;
  }

  function selectedGameProject() {
    const select = $('itemGameProject');
    const projects = readGameProjects();
    const selectedId = safeGameProjectId(select?.value);
    return projects.find((project) => project.projectId === selectedId) || projects[0];
  }

  function rememberGameProjectTarget() {
    if (!currentAsset) return;
    const project = selectedGameProject();
    if (!project) return;
    try {
      localStorage.setItem(MARKET_GAME_TARGET_KEY, JSON.stringify({
        assetId: currentAsset.id,
        projectId: project.projectId,
        projectName: project.name,
        savedAt: Date.now(),
      }));
    } catch (_error) {
      // The active Project is still recovered from the normal local workspace state.
    }
  }

  function renderGameProjectOptions() {
    const select = $('itemGameProject');
    if (!select) return;
    const previousId = safeGameProjectId(select.value);
    const projects = readGameProjects();
    select.replaceChildren(...projects.map((project) => {
      const option = document.createElement('option');
      option.value = project.projectId;
      option.textContent = project.name;
      option.title = project.projectId;
      return option;
    }));
    const nextId = projects.some((project) => project.projectId === previousId)
      ? previousId
      : projects[0]?.projectId;
    if (nextId) select.value = nextId;
  }

  function renderGameUseAction(status = '') {
    const section = $('itemGameUse');
    if (!section) return;
    const available = gameUseAvailable && currentAsset !== null && isPixieeDrawProduct(currentAsset);
    section.hidden = !available;
    if (!available) return;
    renderGameProjectOptions();
    const button = $('itemUseInGame');
    if (button) button.disabled = gameUseBusy;
    const statusNode = $('itemGameUseStatus');
    if (statusNode && status) statusNode.textContent = status;
  }

  function unlockGameUse(status) {
    gameUseAvailable = true;
    renderGameUseAction(status);
  }

  function marketRecordObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  }

  function marketString(value) {
    return typeof value === 'string' && value.trim() ? value.trim() : '';
  }

  function marketStringList(value) {
    return Array.isArray(value)
      ? [...new Set(value.map(marketString).filter(Boolean))]
      : [];
  }

  async function marketSha256(blob) {
    if (!window.crypto?.subtle) return '';
    const digest = new Uint8Array(await window.crypto.subtle.digest('SHA-256', await blob.arrayBuffer()));
    return Array.from(digest, (value) => value.toString(16).padStart(2, '0')).join('');
  }

  async function useCurrentAssetInGame() {
    if (gameUseBusy || !purchaseClient || !purchaseUser || !currentAsset) return;
    if (!isPixieeDrawProduct(currentAsset)) return;
    const button = $('itemUseInGame');
    const status = $('itemGameUseStatus');
    const delivery = window.PiXiEEDMarketDelivery;
    const project = selectedGameProject();
    if (!button || !status || !delivery?.stagePiXiEEDrawFile || !project) return;
    gameUseBusy = true;
    renderGameUseAction('EntitlementとAsset本体を確認しています…');
    try {
      const response = await purchaseClient.functions.invoke('market-download', {
        body: { action: 'authorize', kind: 'pixieedraw-open', asset_id: currentAsset.id },
      });
      if (response.error) throw new Error(await functionErrorMessage(response.error, '購入済みAssetを準備できませんでした。'));
      const payload = marketRecordObject(response.data) || {};
      const source = marketRecordObject(payload.source) || marketRecordObject(payload.asset);
      const license = marketRecordObject(payload.license);
      const entitlement = marketRecordObject(payload.entitlement);
      const files = Array.isArray(payload.files) ? payload.files : [];
      const file = files.find((candidate) => marketRecordObject(candidate)?.format === 'pixiedraw-project');
      const sourceAssetId = marketString(source?.assetId) || marketString(source?.asset_id) || marketString(source?.id);
      const revisionId = marketString(source?.revisionId) || marketString(source?.revision_id);
      const contentHash = (marketString(source?.contentHash) || marketString(source?.content_hash)).toLowerCase();
      const licenseId = marketString(license?.license_id);
      const rights = marketStringList(license?.rights);
      const traceId = marketString(payload.trace_id);
      const packageHash = marketString(file?.sha256).toLowerCase();
      const fileUrl = marketString(file?.url);
      const acquisitionKind = marketString(entitlement?.acquisition_kind);
      if (
        source === null || sourceAssetId !== currentAsset.id || !revisionId ||
        !/^[a-f0-9]{64}$/i.test(contentHash) || !/^[a-f0-9]{64}$/i.test(packageHash) ||
        !entitlement || !marketString(entitlement.id) || !['paid', 'free', 'admin'].includes(acquisitionKind) ||
        license?.in_game_use !== true || !licenseId || rights.length === 0 || !traceId ||
        !file || fileUrl.length === 0
      ) {
        throw new Error('Assetのrevision・利用権・配信情報を確認できませんでした。');
      }
      const download = await fetch(fileUrl, { cache: 'no-store', credentials: 'omit' });
      if (!download.ok) throw new Error('Asset本体を取得できませんでした。もう一度お試しください。');
      const blob = await download.blob();
      if (await marketSha256(blob) !== packageHash) throw new Error('Asset本体の整合性を確認できませんでした。');
      const token = await delivery.stagePiXiEEDrawFile(blob, {
        filename: marketString(file.name) || 'market-asset.pxd',
        assetId: currentAsset.id,
        traceId,
        targetProjectId: project.projectId,
        mode: 'GAME_BIND',
        source: {
          assetId: currentAsset.id,
          revisionId,
          contentHash,
          packageHash,
          label: marketString(source.label) || marketString(source.title) || currentAsset.title || 'Market Asset',
          format: 'pixiedraw-project',
          layout: marketString(source.layout) || 'FULL_CANVAS',
          ...(marketString(source.project_id) ? { projectId: marketString(source.project_id) } : {}),
        },
        delivery: {
          deliveryId: traceId,
          status: 'SECURE_DELIVERED',
          assetId: currentAsset.id,
          revisionId,
          contentHash,
          packageHash,
          format: 'pixiedraw-project',
          licenseId,
        },
        entitlement: {
          id: marketString(entitlement.id),
          acquisitionKind,
        },
        license: {
          licenseId,
          status: 'ACTIVE',
          inGameUse: true,
          rights,
        },
      });
      const binding = await purchaseClient.rpc('market_record_asset_binding_v1', {
        input_asset_id: currentAsset.id,
        input_project_id: project.projectId,
        input_revision_id: revisionId,
        input_content_hash: contentHash,
        input_license_id: licenseId,
        input_delivery_id: traceId,
      });
      const bindingRecord = marketRecordObject(binding.data);
      if (binding.error || bindingRecord?.ok !== true) throw new Error('iGAME素材Bindingをサーバーへ記録できませんでした。');
      status.textContent = 'iGAMEを開き、選択したProjectの素材棚へ追加します…';
      const destination = new URL('/pixiedraw2/', window.location.origin);
      destination.searchParams.set('mode', 'GAME');
      destination.searchParams.set('projectId', project.projectId);
      destination.searchParams.set('projectName', project.name);
      destination.searchParams.set('market_bind', token);
      window.location.assign(destination.toString());
    } catch (error) {
      status.textContent = error?.message || 'iGAMEへ追加できませんでした。';
    } finally {
      gameUseBusy = false;
      renderGameUseAction();
    }
  }

  function accountLoginUrl() {
    const account = new URL('/account/', window.location.origin);
    account.searchParams.set('returnTo', window.location.href);
    account.hash = 'authPanel';
    return account.href;
  }

  async function functionErrorMessage(error, fallback) {
    try {
      const payload = await error?.context?.clone?.().json?.();
      if (payload?.error) return String(payload.error);
    } catch (_error) {}
    return String(error?.message || fallback);
  }

  async function findExistingPurchase() {
    if (!purchaseClient || !currentAsset) return null;
    const { data } = await purchaseClient
      .from('market_purchases')
      .select('id,status,payment_provider')
      .eq('asset_id', currentAsset.id)
      .in('status', ['paid', 'granted', 'disputed'])
      .limit(1)
      .maybeSingle();
    return data || null;
  }

  async function grantAdminAccess() {
    if (!purchaseClient || !currentAsset) return;
    setPurchaseState({ disabled: true, label: '管理者取得を処理中', status: '無料取得権をサーバーで確認しています。' });
    try {
      const { data, error } = await purchaseClient.rpc('market_grant_admin_asset_access_v1', {
        input_asset_id: currentAsset.id
      });
      if (error || !data?.purchase_id) throw new Error(error?.message || '管理者取得を完了できませんでした');
      const alreadyPaid = data.status === 'paid';
      setPurchaseState({
        disabled: true,
        label: alreadyPaid ? '購入済み' : '管理者取得済み',
        status: alreadyPaid
          ? 'この商品は購入済みです。マイページから確認できます。'
          : '無料取得しました。販売数・限定販売枠・売上には加算されません。マイページから出力できます。'
      });
      if (isPixieeDrawProduct(currentAsset)) unlockGameUse('取得済みです。iGAMEへ追加できます。');
    } catch (error) {
      setPurchaseState({
        disabled: false,
        label: '管理者として無料取得',
        status: `管理者取得を完了できませんでした: ${error.message || '時間をおいて再試行してください'}`
      });
    }
  }

  async function acquireFreeAsset() {
    if (!purchaseClient || !purchaseUser || !currentAsset) return;
    setPurchaseState({ disabled: true, label: '無料取得を処理中', status: '無料Assetの取得記録と利用権をサーバーで発行しています。' });
    try {
      const { data, error } = await purchaseClient.rpc('market_acquire_free_asset_v1', {
        input_asset_id: currentAsset.id
      });
      if (error || !data?.ok) throw new Error(error?.message || '無料取得を完了できませんでした');
      setPurchaseState({
        disabled: true,
        label: '無料取得済み',
        status: data.already_available
          ? 'このAssetは取得済みです。マイページから確認できます。'
          : '無料取得しました。マイページから出力し、iGAMEのAsset一覧から使用できます。'
      });
      if (isPixieeDrawProduct(currentAsset)) unlockGameUse('無料取得済みです。iGAMEへ追加できます。');
    } catch (error) {
      setPurchaseState({
        disabled: false,
        label: '無料で取得',
        status: `無料取得を完了できませんでした: ${error.message || '時間をおいて再試行してください'}`
      });
    }
  }

  async function waitForPaidPurchase() {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const purchase = await findExistingPurchase();
      if (purchase?.status === 'paid') {
        setPurchaseState({ disabled: true, label: '購入済み', status: '購入済み商品へ追加しました。マイページから確認できます。' });
        if (isPixieeDrawProduct(currentAsset)) unlockGameUse('購入済みです。iGAMEへ追加できます。');
        return;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 1000));
    }
    setPurchaseState({ disabled: true, label: '支払い確認中', status: 'Stripeからの確認を待っています。しばらくしてからマイページを確認してください。' });
  }

  async function reconcilePaidPurchase() {
    if (!purchaseClient || !currentAsset) return false;
    const { data, error } = await purchaseClient.functions.invoke('market-reconcile-purchase', {
      body: { asset_id: currentAsset.id }
    });
    if (error || !data?.ok) throw new Error(data?.error || await functionErrorMessage(error, '購入済み決済を照合できませんでした'));
    return data.reconciled === true;
  }

  async function createPurchaseIntent() {
    if (!purchaseClient || !purchaseUser || !currentAsset) return;
    rememberGameProjectTarget();
    setPurchaseState({ disabled: true, label: 'Stripeを開いています', status: '商品と販売料金をサーバーで確認しています。' });
    try {
      const { data, error } = await purchaseClient.functions.invoke('market-create-checkout', {
        body: { asset_id: currentAsset.id }
      });
      if (error || !data?.ok) {
        throw new Error(data?.error || await functionErrorMessage(error, 'Stripe購入画面を開始できませんでした'));
      }
      if (!/^https:\/\/checkout\.stripe\.com\//i.test(data?.url || '')) throw new Error('Stripe購入画面を確認できませんでした');
      window.location.assign(data.url);
    } catch (error) {
      if (/sold out|売り切れ/i.test(error?.message || '')) {
        currentAsset.withdrawn_at = currentAsset.withdrawn_at || new Date().toISOString();
        $('itemPreviewFrame').classList.add('is-sold-out');
        $('itemSoldOut').hidden = false;
        setPurchaseState({ disabled: true, label: 'SOLD OUT', status: 'この商品は売り切れました。商品情報は引き続き閲覧できます。' });
        return;
      }
      setPurchaseState({
        disabled: false,
        label: 'Stripeで購入',
        status: `購入手続きを開始できませんでした: ${error.message || '時間をおいて再試行してください'}`
      });
    }
  }

  async function initPurchase() {
    if (!currentAsset) return;
    if (!isAcquisitionEnabled(currentAsset)) {
      setPurchaseState({ disabled: true, label: '公開のみ', status: 'この作品は閲覧専用です。購入・無料取得・iGAMEへの取得はできません。' });
      return;
    }
    if (window.location.protocol === 'file:') {
      setPurchaseState({ disabled: true, label: 'HTTPで購入確認できます', status: 'ローカルファイル表示ではログイン状態を確認できません。' });
      return;
    }
    try {
      if (!purchaseClient) throw new Error('market client unavailable');
      if (!purchaseUser) {
        const { data: { user } } = await purchaseClient.auth.getUser();
        purchaseUser = user || null;
      }
      if (!purchaseUser) {
        setPurchaseState({ disabled: false, label: 'ログインして購入', status: '購入手続きにはログインが必要です。' });
        $('itemPurchase').addEventListener('click', () => { window.location.assign(accountLoginUrl()); }, { once: true });
        return;
      }
      const existingPurchase = await findExistingPurchase();
      if (existingPurchase?.status === 'paid') {
        // Re-run the idempotent server-side materializer. This repairs a
        // historic paid purchase whose earlier webhook marked it paid before
        // its royalty ledger was created.
        try { await reconcilePaidPurchase(); } catch (_ignored) {}
        setPurchaseState({ disabled: true, label: '購入済み', status: 'この商品は購入済みです。マイページから確認できます。' });
        if (isPixieeDrawProduct(currentAsset)) unlockGameUse('購入済みです。iGAMEへ追加できます。');
        return;
      }
      if (existingPurchase?.status === 'granted') {
        const isFreeAcquisition = existingPurchase.payment_provider === 'free_acquisition';
        setPurchaseState({
          disabled: true,
          label: isFreeAcquisition ? '無料取得済み' : '管理者取得済み',
          status: isFreeAcquisition
            ? '無料取得済みです。マイページから確認できます。'
            : '管理者として無料取得済みです。マイページから確認できます。'
        });
        if (isPixieeDrawProduct(currentAsset)) unlockGameUse('無料取得済みです。iGAMEへ追加できます。');
        return;
      }
      if (existingPurchase?.status === 'disputed') {
        setPurchaseState({ disabled: true, label: '確認中', status: 'この購入は支払い確認中のため、再購入できません。' });
        return;
      }
      if (isSoldOut(currentAsset)) {
        setPurchaseState({
          disabled: true,
          label: 'SOLD OUT',
          status: currentAsset.withdrawn_at
            ? '出品者により取り下げられました。購入済みの利用権と派生関係は維持されます。'
            : '限定数に達したため売り切れました。商品情報は引き続き閲覧できます。'
        });
        return;
      }
      const { data: isAdmin, error: adminError } = await purchaseClient.rpc('market_current_user_is_admin');
      if (!adminError && isAdmin === true) {
        setPurchaseState({
          disabled: false,
          label: '管理者として無料取得',
          status: 'Stripe決済を行わず取得できます。販売数・限定販売枠・売上には加算されません。'
        });
        $('itemPurchase').addEventListener('click', grantAdminAccess);
        return;
      }
      if (Number(currentAsset.sale_price_yen || 0) === 0) {
        setPurchaseState({ disabled: false, label: '無料で取得', status: '無料で取得すると、マイページとiGAMEのAsset一覧からすぐに使用できます。' });
        $('itemPurchase').addEventListener('click', acquireFreeAsset);
        return;
      }
      if (Number(currentAsset.sale_price_yen || 0) < 500) {
        setPurchaseState({ disabled: true, label: '販売停止中', status: '現在の最低販売価格500円を下回るため購入できません。' });
        return;
      }
      if (currentAsset.creator_user_id === purchaseUser.id) {
        setPurchaseState({ disabled: true, label: '自分の商品です', status: '出品者本人は自分の商品を購入できません。' });
        return;
      }
      const purchaseResult = new URLSearchParams(location.search).get('purchase');
      if (purchaseResult === 'success') {
        setPurchaseState({ disabled: true, label: '支払いを確認しています', status: 'Stripeから購入結果を確認しています。購入済みへの反映には少し時間がかかる場合があります。' });
        await waitForPaidPurchase();
        const purchaseAfterWait = await findExistingPurchase();
        if (purchaseAfterWait?.status !== 'paid') {
          setPurchaseState({ disabled: true, label: '決済を照合しています', status: 'Webhook未到達の決済を安全に照合しています。' });
          await reconcilePaidPurchase();
          const reconciledPurchase = await findExistingPurchase();
          if (reconciledPurchase?.status === 'paid') {
            setPurchaseState({ disabled: true, label: '購入済み', status: '決済を確認し、購入済み商品へ追加しました。マイページから確認できます。' });
            if (isPixieeDrawProduct(currentAsset)) unlockGameUse('購入済みです。iGAMEへ追加できます。');
            return;
          }
        }
        return;
      }
      setPurchaseState({
        disabled: false,
        label: 'Stripeで購入',
        status: purchaseResult === 'cancelled'
          ? '支払いは行われませんでした。購入する場合はもう一度開始してください。'
          : `${yen(currentAsset.sale_price_yen)}をStripeの安全な購入画面で支払います。`
      });
      $('itemPurchase').addEventListener('click', createPurchaseIntent);
    } catch (_error) {
      setPurchaseState({ disabled: true, label: '購入状態を確認できません', status: '通信状態を確認して再読み込みしてください。' });
    }
  }

  async function load() {
    const marketAccess = window.PiXiEEDMarketAccess;
    const id = currentAssetId();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id || '')) {
      $('itemStatus').textContent = '商品を特定できませんでした。マーケット一覧から開き直してください。'; return;
    }
    // Start auth in parallel, but do not make public product rendering wait
    // for the Supabase ESM client or a getUser() round trip.
    const accessPromise = marketAccess
      ? marketAccess.check()
      : Promise.resolve({ allowed: false, client: null, user: null });
    try {
      const asset = await loadPublicAsset(id);
      if (!asset) { $('itemStatus').textContent = 'この商品は公開されていないか、見つかりません。'; return; }

      // 本文・価格・販売状況を最優先で出す。お気に入りと署名付き画像は
      // 補助情報なので、通信待ちでこの表示を遅らせない。
      render(asset);

      // A signed preview is also public, so it can be fetched in parallel
      // with the client/auth bootstrap rather than waiting behind it.
      const previewTask = loadPublicPreview(asset.id)
        .then((previewData) => {
          const previewUrl = previewData?.previews?.[asset.id];
          if (typeof previewUrl === 'string' && /^https?:\/\//i.test(previewUrl)) {
            asset.preview_url = previewUrl;
            asset.marketPreviewReady = true;
          }
          if (Array.isArray(previewData?.samples?.[asset.id])) asset.sample_preview_urls = previewData.samples[asset.id];
          asset.sample_watermark_baked = previewData?.sample_watermark_baked?.[asset.id] === true;
          renderPreviewMedia(asset);
        })
        .catch(() => {});

      const client = marketAccess ? await marketAccess.getClient().catch(() => null) : null;
      if (!client) {
        setPurchaseState({ disabled: true, label: '購入状態を確認できません', status: '通信状態を確認して再読み込みしてください。' });
        return;
      }
      purchaseClient = client;

      void favorites?.prepare?.([asset]);

      // 購入ボタンだけはログイン確認後に確定する。商品閲覧は常に可能。
      const access = await accessPromise;
      purchaseUser = access.user || null;
      await initPurchase();
      await previewTask;
      void loadRelated(asset);
    } catch (_error) {
      $('itemStatus').textContent = '商品を読み込めませんでした。時間をおいて再試行してください。';
    }
  }

  document.querySelectorAll('[data-related-kind]').forEach((button) => button.addEventListener('click', () => {
    relatedKind = button.dataset.relatedKind || 'popular'; relatedLimit = RELATED_PAGE_SIZE; renderRelated();
  }));
  $('itemRelatedMore')?.addEventListener('click', () => { relatedLimit = Math.min(RELATED_MAX, relatedLimit + RELATED_PAGE_SIZE); renderRelated(); });
  $('itemUseInGame')?.addEventListener('click', () => { void useCurrentAssetInGame(); });
  load();
})();
